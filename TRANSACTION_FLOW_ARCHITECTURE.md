# Bevick IMS - Complete Transaction Flow & Architecture

## Executive Summary
Bevick IMS is a **Supabase-backed Inventory Management System** with real-time synchronization. It follows a **local-first architecture** where all state changes happen optimistically in React, then sync asynchronously to Supabase. The system manages three main transaction types: **Sales** (inventory deduction), **Bookings** (orders with auto-generated Purchase Orders), and **Goods Received** (inbound stock).

---

## 1. HIGH-LEVEL ARCHITECTURE DIAGRAM

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          BEVICK IMS ARCHITECTURE                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────┐
│     FRONTEND (React + Vite)     │
├─────────────────────────────────┤
│ Pages:                          │
│  • Sales.jsx          (Sales)   │
│  • Booked.jsx         (Orders)  │
│  • Purchase.jsx       (POs)     │
│  • Goods.jsx          (GRN)     │
│  • Inventory.jsx      (Stock)   │
│  • Dashboard.jsx      (Metrics) │
│  • Expenses.jsx       (Costs)   │
│  • Customers.jsx      (CRM)     │
│                                 │
│ State Management:               │
│  • AppContext.jsx (Redux-like)  │
│  • Local state + sync queue     │
└──────┬──────────────────────────┘
       │
       ├─→ sync.js (POST actions to DB)
       │   └─→ Retry logic (3x, exp backoff)
       │
       ├─→ realtime.js (RECEIVE updates from DB)
       │   └─→ Wildcard channel subscription
       │
       ├─→ db.js (LOAD initial data)
       │   └─→ Parallel fetch, seed defaults
       │
       └─→ supabase.js (DB connection)
           └─→ Session token auth

           ↓↕ (REST API + WebSocket)

┌─────────────────────────────────┐
│   SUPABASE (PostgreSQL + RT)    │
├─────────────────────────────────┤
│ Tables:                         │
│  • app_settings                 │
│  • app_users                    │
│  • inventory                    │
│  • sales                        │
│  • customers                    │
│  • expenses                     │
│  • bookings                     │
│  • purchase_list                │
│  • goods_received               │
│  • suppliers                    │
│  • recycle_bin                  │
│  • audit_log                    │
└─────────────────────────────────┘

           ↓ (Optional)

┌─────────────────────────────────┐
│   BACKEND (Node.js - Optional)  │
├─────────────────────────────────┤
│ Controllers:                    │
│  • inventoryController.js       │
│                                 │
│ Models:                         │
│  • inventoryModel.js            │
│                                 │
│ Routes:                         │
│  • inventory.js                 │
└─────────────────────────────────┘
```

---

## 2. TRANSACTION FLOW: SALES → INVENTORY DEDUCTION

### **Flow A: Record a Sale (Inventory Deduction)**

```
┌──────────────────────────────────────────────────────────────────────┐
│                     SALES TRANSACTION FLOW                           │
└──────────────────────────────────────────────────────────────────────┘

Step 1: USER INPUT (Sales.jsx)
────────────────────────────────
  └─ User selects items from inventory
  └─ Specifies qty, unit price, payment method (Cash/Transfer/POS/Cheque/Credit)
  └─ Sets payment amount, discount, VAT
  └─ Clicks "Add Sale"

Step 2: DISPATCH ACTION (AppContext)
─────────────────────────────────────
  Dispatch({
    type: 'ADD_SALE',
    payload: {
      id: 'SALE_xxxx',
      customer: 'Customer Name',
      branch: 'DUB' | 'KUB',
      items: [
        { id: 'item_1', name: 'Item A', qty: 5, unitPrice: 100, costPrice: 50 },
        { id: 'item_2', name: 'Item B', qty: 3, unitPrice: 200, costPrice: 120 }
      ],
      subtotal: 1100,
      vat: 110,
      total: 1210,
      paymentMethod: 'Cash',
      amountPaid: 1210,
      discount: 0,
      createdBy: 'user.id',
      createdAt: 'timestamp'
    }
  })

Step 3: STATE CALCULATION (AppContext Reducer)
───────────────────────────────────────────────
  BEFORE STATE:
    inventory: [
      { id: 'item_1', name: 'Item A', qty: 100, branch: 'DUB' },
      { id: 'item_2', name: 'Item B', qty: 50, branch: 'DUB' }
    ]
    sales: []
    auditLog: []

  REDUCER LOGIC:
    a) Add sale to sales array
       └─ sales.push(newSale)

    b) For EACH sold item:
       └─ Find inventory item by id
       └─ Deduct qty: item.qty -= sold_qty
       
       Example:
         item_1.qty: 100 → 95 (100 - 5)
         item_2.qty: 50 → 47 (50 - 3)

    c) Add audit log entry
       └─ auditLog.push({
            id: 'log_xxxx',
            action: 'ADD_SALE',
            user: 'user.id',
            detail: 'Sale SALE_xxxx: 2 items, total 1210',
            timestamp: now,
            metadata: { saleId: 'SALE_xxxx', items: 2 }
          })

  AFTER STATE:
    inventory: [
      { id: 'item_1', qty: 95 },    ← CHANGED
      { id: 'item_2', qty: 47 }     ← CHANGED
    ]
    sales: [ { ...newSale } ]        ← ADDED
    auditLog: [ { ...logEntry } ]    ← ADDED

Step 4: SYNC TO DATABASE (sync.js)
───────────────────────────────────
  syncAction('ADD_SALE', prevState, nextState) triggers:

  ┌─ upsert('sales', newSale)
  │    └─ INSERT or UPDATE record in Supabase 'sales' table
  │    └─ Retry: 3 attempts with exponential backoff (400ms → 800ms → 1600ms)
  │    └─ On error: Toast notification shown; data stays in local state
  │
  └─ upsertMany('inventory', [modifiedItem1, modifiedItem2])
       └─ CHUNK into batches of 50 (handles large datasets)
       └─ UPDATE qty for each item
       └─ Same retry logic applied

  ✓ SUCCESS: Records persisted to Supabase PostgreSQL

Step 5: BROADCAST TO OTHER CLIENTS (Realtime Supabase)
──────────────────────────────────────────────────────
  Supabase detects INSERT in 'sales' table + UPDATE in 'inventory' table
  
  ┌─ Broadcast Event 1: INSERT event on 'sales'
  │    └─ All connected clients receive: { table: 'sales', event: 'INSERT', row: {...} }
  │    └─ Their reducer: dispatch(REMOTE_CHANGE) 
  │    └─ append row to their sales[]
  │
  └─ Broadcast Event 2: UPDATE event on 'inventory'
       └─ All connected clients receive: { table: 'inventory', event: 'UPDATE', row: {...} }
       └─ Their reducer: dispatch(REMOTE_CHANGE)
       └─ upsert row into their inventory[]

Step 6: UI UPDATES
──────────────────
  Original User:
    ✓ Sees sale added to Sales list
    ✓ Sees inventory qty updated immediately
    ✓ Toast: "Sale recorded successfully"

  Other Connected Users:
    ✓ Realtime sync updates their UI
    ✓ Inventory qty changes visible on their Dashboard/Inventory pages
    ✓ They see the new sale in Sales list

END RESULT:
───────────
  • Sale recorded in database
  • Inventory qty reduced by sold qty
  • Audit trail created
  • All users synchronized
  • Stock now reflects actual available items
```

### **Key Formulas in Sales**
```javascript
// Inventory Deduction Logic
for (const item of sale.items) {
  const invItem = state.inventory.find(i => i.id === item.id);
  if (invItem) {
    invItem.qty -= item.qty;  // CRITICAL: Deduction happens here
  }
}

// Sale Calculation
subtotal = sum(item.qty * item.unitPrice for all items)
vat = subtotal * vatPercentage
total = subtotal + vat - discount
profit = sum(item.qty * (unitPrice - costPrice))
```

---

## 3. BOOKING FLOW: AUTO-GENERATION OF PURCHASE ORDERS

### **Flow B: Customer Books Items → Auto-Creates POs if Stock Insufficient**

```
┌──────────────────────────────────────────────────────────────────────┐
│                    BOOKING TRANSACTION FLOW                          │
└──────────────────────────────────────────────────────────────────────┘

Step 1: USER INPUT (Booked.jsx)
────────────────────────────────
  Option A: Select from "Full Factory Template"
    └─ Pre-populated list of ~75 equipment/consumables for factory setups
    └─ User selects items and quantities

  Option B: Manual/Custom Booking
    └─ User selects specific items from inventory dropdown
    └─ Specifies qty requested

  Example:
    Booking for: "ABC Factory Setup"
    Items:
      - Conveyor Belt (qty: 2)
      - Control Panel (qty: 1)
      - Motor 5HP (qty: 3)
      - Spare Parts Kit (qty: 5)

  Status starts as: 'pending' (awaiting stock/fulfillment)

Step 2: DISPATCH ADD_BOOKING ACTION
────────────────────────────────────
  Dispatch({
    type: 'ADD_BOOKING',
    payload: {
      id: 'BK_xxxx',
      customer: 'ABC Factory',
      branch: 'DUB',
      status: 'pending',
      items: [
        { itemId: 'item_1', itemName: 'Conveyor Belt', qty_requested: 2, qty_available: 1 },
        { itemId: 'item_2', itemName: 'Control Panel', qty_requested: 1, qty_available: 0 },
        { itemId: 'item_3', itemName: 'Motor 5HP', qty_requested: 3, qty_available: 2 },
        { itemId: 'item_4', itemName: 'Spare Parts Kit', qty_requested: 5, qty_available: 5 }
      ],
      createdBy: 'user.id'
    }
  })

Step 3: CRITICAL CHECK - AUTO-PO GENERATION (AppContext Reducer)
──────────────────────────────────────────────────────────────────
  
  ╔═══════════════════════════════════════════════════════════════════╗
  ║ FOR EACH BOOKING ITEM, CALCULATE TOTAL INVENTORY ACROSS BRANCHES ║
  ╚═══════════════════════════════════════════════════════════════════╝

  Item: Conveyor Belt (qty_requested: 2)
  ├─ Search inventory for "Conveyor Belt" across ALL branches
  ├─ DUB branch: qty = 1
  ├─ KUB branch: qty = 0
  ├─ TOTAL AVAILABLE = 1
  ├─ SHORTAGE = 2 - 1 = 1  ← NEED TO ORDER
  └─ AUTO-CREATE PO: { itemId: 'item_1', qty: 1, status: 'pending', bookingId: 'BK_xxxx' }

  Item: Control Panel (qty_requested: 1)
  ├─ DUB branch: qty = 0
  ├─ KUB branch: qty = 0
  ├─ TOTAL AVAILABLE = 0
  ├─ SHORTAGE = 1 - 0 = 1  ← NEED TO ORDER
  └─ AUTO-CREATE PO: { itemId: 'item_2', qty: 1, status: 'pending', bookingId: 'BK_xxxx' }

  Item: Motor 5HP (qty_requested: 3)
  ├─ DUB branch: qty = 2
  ├─ KUB branch: qty = 0
  ├─ TOTAL AVAILABLE = 2
  ├─ SHORTAGE = 3 - 2 = 1  ← NEED TO ORDER
  └─ AUTO-CREATE PO: { itemId: 'item_3', qty: 1, status: 'pending', bookingId: 'BK_xxxx' }

  Item: Spare Parts Kit (qty_requested: 5)
  ├─ DUB branch: qty = 5
  ├─ KUB branch: qty = 0
  ├─ TOTAL AVAILABLE = 5
  ├─ SHORTAGE = 5 - 5 = 0  ← NO ORDER NEEDED
  └─ NO PO CREATED for this item

Step 4: STATE UPDATE
────────────────────
  BEFORE:
    bookings: []
    purchaseList: []

  AFTER:
    bookings: [
      { id: 'BK_xxxx', customer: 'ABC Factory', status: 'pending', items: [...] }
    ]
    purchaseList: [
      { id: 'PO_1', itemId: 'item_1', qty: 1, status: 'pending', bookingId: 'BK_xxxx' },
      { id: 'PO_2', itemId: 'item_2', qty: 1, status: 'pending', bookingId: 'BK_xxxx' },
      { id: 'PO_3', itemId: 'item_3', qty: 1, status: 'pending', bookingId: 'BK_xxxx' }
    ]

  NOTE: Booking does NOT modify inventory directly
        └─ Inventory only changes when goods actually arrive (goods_received)

Step 5: SYNC TO DATABASE
─────────────────────────
  syncAction('ADD_BOOKING', prevState, nextState):

  ├─ upsert('bookings', newBooking)
  ├─ upsertMany('purchase_list', [3 new POs])
  └─ No inventory changes (inventory stays the same)

  Result:
    • Booking saved to Supabase
    • 3 Purchase Orders auto-created and saved
    • Booking & POs linked by bookingId

Step 6: WORKFLOW CONTINUATION
──────────────────────────────
  
  ┌─ Purchase.jsx User Views
  │   └─ 3 pending POs appear in "Pending Orders" list
  │   └─ Supplier info populated
  │   └─ User updates status: pending → ordered
  │       └─ dispatch(UPDATE_PURCHASE_STATUS)
  │       └─ PO status now: 'ordered'
  │
  ├─ When goods arrive from supplier
  │   └─ User goes to Goods.jsx
  │   └─ Creates GRN with received items
  │   └─ dispatch(RECEIVE_GOODS)
  │   └─ Inventory incremented
  │   └─ PO status updated: ordered → received → fulfilled
  │
  └─ Back in Booked.jsx
      └─ User can now fulfill booking
      └─ dispatch(UPDATE_BOOKING, status: 'confirmed' → 'delivered')
      └─ Booking complete

BOOKING STATUS LIFECYCLE:
─────────────────────────
  pending       → Item not in stock, waiting for goods
    ↓
  confirmed     → Item in stock, ready to deliver
    ↓
  delivered     → Delivered to customer
    ↓
  (or cancelled at any step)
```

### **Key Booking Logic**
```javascript
// Stock Check (BEFORE creating PO)
function checkStock(bookingItem) {
  const totalAvailable = state.inventory
    .filter(inv => inv.id === bookingItem.itemId)  // Same item across branches
    .reduce((sum, inv) => sum + (inv.qty || 0), 0);
  
  const shortage = bookingItem.qty_requested - totalAvailable;
  
  if (shortage > 0) {
    // AUTO-CREATE PO
    return { needsPO: true, qtyToOrder: shortage };
  }
  return { needsPO: false };
}
```

---

## 4. PURCHASE ORDER FLOW: FROM BOOKING TO FULFILLMENT

### **Flow C: Purchase Order Lifecycle**

```
┌──────────────────────────────────────────────────────────────────────┐
│              PURCHASE ORDER & GOODS RECEIVED FLOW                    │
└──────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════
STAGE 1: AUTO-GENERATED FROM BOOKING (explained above)
═══════════════════════════════════════════════════════════════════════

  Booking: 3 items needed
    ├─ Item 1: shortage = 1  → PO created (qty: 1)
    ├─ Item 2: shortage = 1  → PO created (qty: 1)
    └─ Item 3: shortage = 1  → PO created (qty: 1)

  PO Status: 'pending'
  PO Table:
    id | itemId | itemName | qtyNeeded | supplier | status   | bookingId
    ---|--------|----------|-----------|----------|----------|----------
    1  | item_1 | Conv Btn | 1         | Supplier | pending  | BK_xxxx
    2  | item_2 | Ctrl Pnl | 1         | Supplier | pending  | BK_xxxx
    3  | item_3 | Motor 5HP| 1         | Supplier | pending  | BK_xxxx

═══════════════════════════════════════════════════════════════════════
STAGE 2: USER UPDATES PO STATUS IN PURCHASE.JSX
═══════════════════════════════════════════════════════════════════════

  Step 1: Purchase.jsx displays POs
          └─ User sees 3 pending POs
          └─ Clicks on each to edit supplier info
          └─ Changes status to "ordered"

  Step 2: dispatch(UPDATE_PURCHASE_STATUS)
          {
            type: 'UPDATE_PURCHASE_STATUS',
            payload: {
              poId: 'PO_1',
              newStatus: 'ordered'
            }
          }

  Step 3: Reducer updates purchaseList item
          purchaseList[0].status = 'ordered'

  Step 4: sync.js sends to DB
          upsert('purchase_list', updatedPO)

  Step 5: Realtime broadcast to all users
          └─ Everyone sees PO status: pending → ordered

  PO Status Timeline:
    pending  (awaiting user confirmation)
      ↓
    ordered  (placed with supplier)
      ↓
    received (goods arrived at facility)
      ↓
    fulfilled (restocked, booking can be fulfilled)

═══════════════════════════════════════════════════════════════════════
STAGE 3: GOODS RECEIVED (GRN CREATION)
═══════════════════════════════════════════════════════════════════════

  Step 1: Supplier sends goods
          └─ Delivery includes invoice/packing slip

  Step 2: Warehouse staff goes to Goods.jsx
          └─ Clicks "Add GRN" (Goods Received Note)
          └─ Inputs:
            - Supplier name
            - Invoice number
            - Branch received at (DUB/KUB)
            - Items received with quantities:
              * Conveyor Belt: 1 unit
              * Control Panel: 1 unit
              * Motor 5HP: 1 unit
            - Unit costs (if not pre-configured)
            - Notes/remarks

  Step 3: dispatch(RECEIVE_GOODS)
          {
            type: 'RECEIVE_GOODS',
            payload: {
              id: 'GRN_xxxx',
              supplier: 'Supplier Name',
              invoiceNo: 'INV_2024_001',
              branch: 'DUB',
              items: [
                { itemId: 'item_1', qty: 1, unitCost: 500 },
                { itemId: 'item_2', qty: 1, unitCost: 1200 },
                { itemId: 'item_3', qty: 1, unitCost: 800 }
              ],
              totalCost: 2500,
              receivedBy: 'user.id'
            }
          }

  Step 4: CRITICAL - Inventory INCREMENT (AppContext Reducer)
          
          For EACH received item:
            ├─ Find inventory item by id
            ├─ Increment qty: item.qty += received_qty
            └─ Update branch affiliation
          
          BEFORE:
            inventory: [
              { id: 'item_1', branch: 'DUB', qty: 1 },
              { id: 'item_2', branch: 'DUB', qty: 0 },
              { id: 'item_3', branch: 'DUB', qty: 2 }
            ]

          AFTER:
            inventory: [
              { id: 'item_1', branch: 'DUB', qty: 2 },  ← +1
              { id: 'item_2', branch: 'DUB', qty: 1 },  ← +1
              { id: 'item_3', branch: 'DUB', qty: 3 }   ← +1
            ]

  Step 5: UPDATE RELATED RECORDS
          
          ├─ Purchase Orders: Update status for received items
          │   └─ For each GRN item:
          │     └─ Find matching PO by itemId
          │     └─ If PO.status = 'ordered' → PO.status = 'received'
          │     └─ If PO.status = 'received' → PO.status = 'fulfilled'
          │
          └─ Bookings: Check if any pending bookings can now be fulfilled
              └─ For each booking item:
                └─ If requested_qty now <= available_qty:
                  └─ booking.status = 'pending' → 'confirmed'
                  └─ Mark as ready for fulfillment

  Step 6: SYNC TO DATABASE
          
          syncAction('RECEIVE_GOODS'):
          ├─ upsert('goods_received', newGRN)
          ├─ upsertMany('inventory', [3 updated items])
          ├─ upsertMany('purchase_list', [3 updated POs])
          └─ upsertMany('bookings', [1 updated booking])

═══════════════════════════════════════════════════════════════════════
STAGE 4: BOOKING FULFILLMENT
═══════════════════════════════════════════════════════════════════════

  Step 1: Back to Booked.jsx
          └─ Booking status: pending → confirmed (all items now available)

  Step 2: User clicks "Fulfill/Deliver"
          dispatch(UPDATE_BOOKING, { id: 'BK_xxxx', status: 'delivered' })

  Step 3: Inventory deduction (OPTIONAL - depends on business logic)
          └─ Some systems deduct on booking confirmation
          └─ Some deduct on actual delivery
          └─ Bevick appears to deduct on SALES, not booking

  Step 4: Booking cycle complete
          └─ Customer has items
          └─ Booking marked as 'delivered'
          └─ Can generate invoice/delivery note

═══════════════════════════════════════════════════════════════════════
COMPLETE STATE AFTER ALL TRANSACTIONS
═══════════════════════════════════════════════════════════════════════

  Booking Table:
    id      | customer    | status    | items
    --------|-------------|-----------|------
    BK_xxxx | ABC Factory | delivered | [3 items]

  Purchase List:
    id   | itemId   | qty | status    | bookingId
    -----|----------|-----|-----------|----------
    PO_1 | item_1   | 1   | fulfilled | BK_xxxx
    PO_2 | item_2   | 1   | fulfilled | BK_xxxx
    PO_3 | item_3   | 1   | fulfilled | BK_xxxx

  Inventory:
    id     | name            | qty | branch
    -------|-----------------|-----|-------
    item_1 | Conveyor Belt   | 2   | DUB
    item_2 | Control Panel   | 1   | DUB
    item_3 | Motor 5HP       | 3   | DUB

  Goods Received:
    id      | supplier | invoiceNo    | items
    --------|----------|--------------|-------
    GRN_xxx | Supplier | INV_2024_001 | [3 items]
```

---

## 5. COMPLETE TRANSACTION WATERFALL: TOP TO BOTTOM

### **Full End-to-End Scenario**

```
┌──────────────────────────────────────────────────────────────────────┐
│               COMPLETE TRANSACTION WATERFALL                         │
│                     (All Pages Integrated)                           │
└──────────────────────────────────────────────────────────────────────┘

DAY 1: CUSTOMER BOOKS ITEMS
───────────────────────────────────────────────────────────────────────

  T1: Customer "ABC Factory" calls and wants to buy conveyor system

  T2: Sales rep opens Booked.jsx
      └─ Clicks "Add Booking"
      └─ Selects "Full Factory Template" option
      └─ Gets pre-filled ~75 items
      └─ Removes items not needed, keeps:
          * Conveyor Belt (qty: 2)
          * Control Panel (qty: 1)
          * Motor 5HP (qty: 3)
          * Spare Parts Kit (qty: 5)

  T3: System checks inventory (all branches combined):
      ├─ Conveyor Belt: Available 1, Needed 2 → SHORTAGE: 1
      ├─ Control Panel: Available 0, Needed 1 → SHORTAGE: 1
      ├─ Motor 5HP: Available 2, Needed 3 → SHORTAGE: 1
      └─ Spare Parts Kit: Available 5, Needed 5 → SHORTAGE: 0

  T4: System AUTO-CREATES 3 Purchase Orders
      ├─ PO_001: Conveyor Belt (qty: 1, status: pending)
      ├─ PO_002: Control Panel (qty: 1, status: pending)
      └─ PO_003: Motor 5HP (qty: 1, status: pending)

  T5: Database Sync
      ├─ Booking saved: bookings table
      ├─ 3 POs saved: purchase_list table
      └─ Realtime notification to all users

  T6: Sales Dashboard shows
      ├─ "1 new pending booking"
      ├─ "3 new purchase orders needing attention"
      └─ Inventory notification: "4 items booked, 3 items on order"


DAY 2: PURCHASE MANAGER PLACES ORDERS
───────────────────────────────────────────────────────────────────────

  T1: Purchase manager opens Purchase.jsx
      └─ Sees 3 pending POs

  T2: For each PO, updates:
      ├─ Selects supplier (from Suppliers master)
      ├─ Changes status: pending → ordered
      └─ Adds note: "Confirmed with Supplier, delivery in 5 days"

  T3: Database Sync
      ├─ 3 POs updated with supplier info
      └─ Status changed to "ordered"

  T4: Realtime notification to all users
      └─ "3 purchase orders placed with suppliers"


DAY 6: GOODS ARRIVE FROM SUPPLIER
──────────────────────────────────────────────────────────────────────

  T1: Supplier delivers goods to Dubai warehouse (DUB branch)
      └─ Includes invoice: INV_2024_001

  T2: Warehouse staff opens Goods.jsx
      └─ Clicks "Add GRN"
      └─ Inputs:
          ├─ Supplier: "Supplier Name"
          ├─ Invoice: "INV_2024_001"
          ├─ Branch: "DUB"
          ├─ Items Received:
          │   ├─ Conveyor Belt: 1 unit @ 500 AED
          │   ├─ Control Panel: 1 unit @ 1200 AED
          │   └─ Motor 5HP: 1 unit @ 800 AED
          └─ Total Cost: 2500 AED

  T3: INVENTORY INCREMENTED
      ├─ Conveyor Belt: 1 → 2
      ├─ Control Panel: 0 → 1
      └─ Motor 5HP: 2 → 3

  T4: PURCHASE ORDERS UPDATED
      ├─ PO_001: ordered → received → fulfilled
      ├─ PO_002: ordered → received → fulfilled
      └─ PO_003: ordered → received → fulfilled

  T5: BOOKING STATUS UPDATED
      └─ Booking: pending → confirmed (all items now available)

  T6: Database Sync
      ├─ GRN saved: goods_received table
      ├─ Inventory updated: inventory table
      ├─ POs updated: purchase_list table
      └─ Booking updated: bookings table

  T7: Realtime notification
      ├─ "Goods received: 3 items added to inventory"
      ├─ "Booking ready for fulfillment"
      └─ Dashboard updates instantly


DAY 7: CUSTOMER TAKES DELIVERY, SALE RECORDED
────────────────────────────────────────────────────────────────────────

  T1: Customer picks up goods from warehouse

  T2: Sales rep opens Sales.jsx
      └─ Creates sale for "ABC Factory"
      └─ Adds items:
          ├─ Conveyor Belt: qty 2 @ 600 AED (unit price)
          ├─ Control Panel: qty 1 @ 1500 AED
          ├─ Motor 5HP: qty 3 @ 1000 AED
          ├─ Spare Parts Kit: qty 5 @ 300 AED
      └─ Subtotal: 7700 AED
      └─ VAT (5%): 385 AED
      └─ Total: 8085 AED
      └─ Payment: Cash
      └─ Amount Paid: 8085 AED

  T3: INVENTORY DEDUCTED (Critical)
      ├─ Conveyor Belt: 2 → 0 (2 - 2)
      ├─ Control Panel: 1 → 0 (1 - 1)
      ├─ Motor 5HP: 3 → 0 (3 - 3)
      └─ Spare Parts Kit: 5 → 0 (5 - 5)

  T4: BOOKING MARKED FULFILLED
      └─ Booking status: confirmed → delivered

  T5: DATABASE SYNC
      ├─ Sale created: sales table
      ├─ Inventory updated: inventory table (4 items qty reduced)
      ├─ Booking updated: bookings table (status: delivered)
      └─ Audit log: "Sale SALE_xxxx recorded, 4 items sold"

  T6: REALTIME NOTIFICATIONS
      ├─ All users see sale added
      ├─ Inventory updated on Dashboard/Inventory pages
      ├─ Booking moved to completed
      └─ Revenue metric updated on Dashboard


FINAL STATE (COMPLETE CYCLE):
──────────────────────────────

  ✓ Booking Table:
    - Booking BK_xxxx: status = 'delivered'

  ✓ Purchase Table:
    - PO_001, PO_002, PO_003: status = 'fulfilled'

  ✓ Inventory Table:
    - Conveyor Belt: qty = 0 (was 2, sold 2)
    - Control Panel: qty = 0 (was 1, sold 1)
    - Motor 5HP: qty = 0 (was 3, sold 3)
    - Spare Parts Kit: qty = 0 (was 5, sold 5)

  ✓ Sales Table:
    - Sale SALE_xxxx created with 4 items
    - Total: 8085 AED
    - Profit: ~2500 AED (selling price - cost price for all items)

  ✓ Goods Received Table:
    - GRN_xxx recorded: 3 items received, 2500 AED cost

  ✓ Audit Log:
    - ADD_BOOKING: Created booking for ABC Factory
    - UPDATE_PURCHASE_STATUS (3x): POs marked as ordered
    - RECEIVE_GOODS: 3 items received from supplier
    - ADD_SALE: 4 items sold to ABC Factory
    - All entries timestamped with user info

  ✓ Dashboard Metrics Updated:
    - Revenue +8085 AED
    - Expenses +2500 AED (cost of goods)
    - Profit +5585 AED
    - Inventory: 0 items from this batch (all sold)
    - Bookings: 1 completed
```

---

## 6. DATA FLOW DETAILED: FRONTEND ↔ DATABASE

### **Request Flow: User Action → Database**

```
┌─────────────────────────────────────────────────────────────────┐
│                    REQUEST FLOW (FRONTEND → DB)                │
└─────────────────────────────────────────────────────────────────┘

USER ACTION (Click Button)
    │
    └─→ Event Handler in Component (e.g., Sales.jsx)
        │
        ├─→ Collects form data
        │   └─ items[], customer, paymentMethod, etc.
        │
        └─→ dispatch(action)
            {
              type: 'ADD_SALE',
              payload: { ... }
            }
            │
            └─→ AppContext.reducer(state, action)
                │
                ├─→ CALCULATE nextState
                │   ├─ Add sale to sales[]
                │   ├─ Deduct inventory
                │   └─ Add audit log
                │
                └─→ return nextState
                    │
                    └─→ React re-renders component
                        └─ User sees change IMMEDIATELY
                    │
                    └─→ [Async] dispatch side effect
                        │
                        └─→ sync.js.syncAction(action, prevState, nextState)
                            │
                            ├─→ Map action to Supabase operations
                            │   {
                            │     table: 'sales',
                            │     operation: 'upsert',
                            │     data: newSale
                            │   }
                            │   {
                            │     table: 'inventory',
                            │     operation: 'upsertMany',
                            │     data: [modifiedItems]
                            │   }
                            │
                            └─→ withRetry(fn, 3 attempts)
                                │
                                ├─→ Attempt 1: upsert to Supabase
                                │   └─ supabase.from('sales').upsert(newSale)
                                │   └ SUCCESS ✓ → Continue to next batch
                                │   └ ERROR ✗ → Retry with backoff
                                │       └─ Wait 400ms
                                │
                                ├─→ Attempt 2: Retry after 400ms
                                │   └─ supabase.from('sales').upsert(newSale)
                                │   └ SUCCESS ✓ → Continue
                                │   └ ERROR ✗ → Retry with backoff
                                │       └─ Wait 800ms
                                │
                                ├─→ Attempt 3: Retry after 800ms
                                │   └─ supabase.from('sales').upsert(newSale)
                                │   └ SUCCESS ✓ → Done
                                │   └ ERROR ✗ → All retries failed
                                │       └─ Show Toast: "Error saving sale"
                                │       └─ Data stays in local state
                                │
                                └─→ [Parallel] upsertMany('inventory', items)
                                    └─ CHUNK into batches of 50
                                    └─ Send batch 1 → retry loop
                                    └─ Send batch 2 → retry loop
                                    └─ All batches retry independently

RESULT:
  ✓ Sale persisted to Supabase PostgreSQL
  ✓ Inventory updated in Supabase
  ✓ Ready for broadcast to other clients
```

### **Broadcast Flow: Database → All Clients (Realtime)**

```
┌─────────────────────────────────────────────────────────────────┐
│              BROADCAST FLOW (DATABASE → FRONTEND)              │
└─────────────────────────────────────────────────────────────────┘

USER A saves Sale to Supabase
    │
    └─→ Supabase detects INSERT into 'sales' table
        └─→ PostgreSQL INSERT succeeds
        └─→ Supabase Realtime Engine receives notification
            │
            └─→ Broadcasts to all subscribed clients
                │
                ├─→ USER A (Original client)
                │   └─ Receives: { table: 'sales', event: 'INSERT', row: {...} }
                │   └─ (Usually ignored because already optimistically updated)
                │
                ├─→ USER B (Other connected client)
                │   └─ Receives: { table: 'sales', event: 'INSERT', row: {...} }
                │   └─→ realtime.js handler processes event
                │       │
                │       └─→ dispatch(REMOTE_CHANGE, { table: 'sales', event: 'INSERT', row })
                │           │
                │           └─→ AppContext.reducer(state, action)
                │               │
                │               ├─→ if (event === 'INSERT') sales.push(row)
                │               ├─→ if (event === 'UPDATE') sales[i] = { ...sales[i], ...row }
                │               └─→ if (event === 'DELETE') sales = sales.filter(s => s.id !== row.id)
                │               │
                │               └─→ return nextState
                │                   │
                │                   └─→ React re-renders
                │                       └─ USER B sees new sale appear on their Sales list!
                │
                └─→ USER C (Another connected client)
                    └─ Same process as USER B

ALSO [Parallel]:
    │
    └─→ Supabase detects UPDATE into 'inventory' table (4 items modified)
        │
        └─→ Broadcasts to all subscribed clients
            │
            ├─→ USER A, B, C all receive UPDATE events
            │
            └─→ Each updates their inventory[] with new quantities
                └─ Dashboard re-renders showing updated stock levels

FINAL RESULT:
  ✓ User A: Sees sale created + inventory updated (optimistic + confirmation)
  ✓ User B: Sees sale appear in real-time + inventory update
  ✓ User C: Sees sale appear in real-time + inventory update
  ✓ All synchronized within milliseconds
```

---

## 7. STATE STRUCTURE & ACTIONS

### **Complete Redux-like State**

```javascript
{
  // ╔═ AUTHENTICATION & SESSION ═╗
  user: {
    id: 'user_123',
    name: 'John Sales Manager',
    email: 'john@bevick.com',
    role: 'sales',              // 'super_admin' | 'admin' | 'inventory' | 'sales'
    bid: 'DUB',                 // Branch ID: null (admin sees all) | 'DUB' | 'KUB'
    sessionToken: 'token_xxxx'
  },

  // ╔═ UI STATE ═╗
  page: 'sales',                // Current page: 'dashboard', 'sales', 'booked', etc.
  branch: 'DUB',                // Selected branch filter: null (all) | 'DUB' | 'KUB'
  dbLoaded: false,              // True after initial data load from Supabase
  
  // ╔═ SETTINGS ═╗
  vat: 5,                       // VAT percentage
  currency: 'AED',              // Currency code
  bizName: 'Bevick Packaging',  // Business name
  bizRC: 'RC_123456',           // Registration certificate
  bizPhone: '+971-1-234-5678',
  bizEmail: 'info@bevick.com',
  bizAddress: 'Dubai Market, Building A',
  thr: 10,                      // Low stock threshold
  
  // ╔═ TRANSACTION DATA ═╗
  sales: [
    {
      id: 'SALE_2024_001',
      customer: 'ABC Factory',
      branch: 'DUB',
      items: [
        { id: 'item_1', name: 'Item A', qty: 5, unitPrice: 100, costPrice: 50 },
        { id: 'item_2', name: 'Item B', qty: 3, unitPrice: 200, costPrice: 120 }
      ],
      subtotal: 1100,
      vat: 55,
      discount: 50,
      total: 1105,
      paymentMethod: 'Cash',    // 'Cash' | 'Transfer' | 'POS' | 'Cheque' | 'Credit'
      amountPaid: 1105,
      createdAt: '2024-05-20T10:30:00Z',
      createdBy: 'user_123'
    }
  ],

  bookings: [
    {
      id: 'BK_2024_001',
      customer: 'ABC Factory',
      branch: 'DUB',
      status: 'pending',        // 'pending' | 'confirmed' | 'delivered' | 'cancelled'
      items: [
        { itemId: 'item_1', itemName: 'Conveyor', qty_requested: 2, qty_available: 1 },
        { itemId: 'item_2', itemName: 'Control Panel', qty_requested: 1, qty_available: 0 }
      ],
      total: 1500,
      createdAt: '2024-05-20T09:00:00Z',
      createdBy: 'user_123'
    }
  ],

  purchaseList: [
    {
      id: 'PO_2024_001',
      itemId: 'item_1',
      itemName: 'Conveyor Belt',
      qtyNeeded: 1,
      qtyOrdered: 0,
      supplier: 'Supplier XYZ',
      status: 'pending',        // 'pending' | 'ordered' | 'received' | 'fulfilled' | 'cancelled'
      bookingId: 'BK_2024_001', // Links back to booking that triggered PO
      createdAt: '2024-05-20T09:00:00Z'
    }
  ],

  goodsReceived: [
    {
      id: 'GRN_2024_001',
      supplier: 'Supplier XYZ',
      branch: 'DUB',
      invoiceNo: 'INV_2024_001',
      items: [
        { itemId: 'item_1', itemName: 'Conveyor', qty: 1, unitCost: 500 }
      ],
      totalCost: 500,
      receivedBy: 'user_123',
      receivedAt: '2024-05-26T14:00:00Z'
    }
  ],

  inventory: [
    {
      id: 'item_1',
      name: 'Conveyor Belt',
      category: 'Machinery',
      qty: 2,               // Total quantity in stock
      unit: 'pieces',
      price: 600,           // Selling price
      costPrice: 500,       // Purchase cost
      minQty: 1,            // Reorder point
      branch: 'DUB',        // Which branch holds this stock
      supplier: 'Supplier XYZ',
      notes: 'Heavy duty model'
    }
  ],

  customers: [
    {
      id: 'cust_1',
      name: 'ABC Factory',
      email: 'contact@abcfactory.com',
      phone: '+971-4-123-4567',
      company: 'ABC Factory LLC',
      address: 'Industrial Area, Dubai'
    }
  ],

  expenses: [
    {
      id: 'exp_001',
      description: 'Office rent',
      amount: 5000,
      category: 'Rent',
      branch: 'DUB',
      date: '2024-05-01',
      createdBy: 'user_123'
    }
  ],

  suppliers: [
    {
      id: 'supp_1',
      name: 'Supplier XYZ',
      contact: 'Mr. Ahmed',
      phone: '+971-6-555-1234',
      email: 'sales@supplerxyz.com',
      category: 'Equipment',
      status: 'active'
    }
  ],

  users: [
    {
      id: 'user_123',
      name: 'John Sales Manager',
      email: 'john@bevick.com',
      role: 'sales',
      bid: 'DUB',
      status: 'active'
    }
  ],

  auditLog: [
    {
      id: 'log_001',
      action: 'ADD_SALE',
      user: 'user_123',
      detail: 'Sale SALE_2024_001: 2 items, total 1105 AED',
      timestamp: '2024-05-20T10:30:00Z',
      metadata: { saleId: 'SALE_2024_001', items: 2 }
    }
  ],

  recycleBin: [
    {
      id: 'rec_001',
      _type: 'sale',           // What type of record was deleted
      data: { ...deletedSale },
      _deletedAt: '2024-05-20T11:00:00Z',
      _deletedBy: 'user_123'
    }
  ],

  // ╔═ FILTERS ═╗
  sF: 'all',                    // Sales filter: 'all' | specific date range
  iF: 'all',                    // Inventory filter: 'all' | low stock | out of stock
  eF: 'all'                     // Expense filter: 'all' | specific category
}
```

### **Key Reducer Actions**

| Action | Trigger | Inventory Impact | New Records | Sync Tables |
|--------|---------|------------------|-------------|-------------|
| `ADD_SALE` | Create sale | DECREMENT qty | sales, auditLog | sales, inventory |
| `UPDATE_SALE` | Edit sale | ADJUST qty | auditLog | sales, inventory |
| `DELETE_SALE` | Delete sale | INCREMENT qty (restore) | recycleBin, auditLog | recycle_bin, inventory |
| `ADD_BOOKING` | Create booking | NO CHANGE (auto creates POs) | bookings, purchaseList, auditLog | bookings, purchase_list |
| `UPDATE_BOOKING` | Edit booking | NO CHANGE | auditLog | bookings, purchase_list |
| `ADD_PURCHASE` | Create PO manually | NO CHANGE | purchaseList, auditLog | purchase_list |
| `UPDATE_PURCHASE_STATUS` | Change PO status | NO CHANGE | auditLog | purchase_list |
| `RECEIVE_GOODS` | Create GRN | INCREMENT qty | goodsReceived, auditLog | goods_received, inventory, bookings, purchase_list |
| `SYNC_PURCHASES_FROM_BOOKINGS` | Bulk sync | NO CHANGE | purchaseList, auditLog | purchase_list |
| `RESTOCK_ITEM` | Manual restock | INCREMENT qty | auditLog | inventory |
| `ADD_ITEM` | Add new inventory item | N/A | inventory | inventory |
| `DELETE_ITEM` | Delete inventory item | N/A | recycleBin | recycle_bin |
| `REMOTE_CHANGE` | Realtime sync | UPDATES based on event | (updates existing) | (already in DB) |

---

## 8. BRANCH LOGIC & MULTI-LOCATION WORKFLOW

### **Dubai (DUB) and Kubwa (KUB) Branches**

```
┌──────────────────────────────────────────────────────────────────┐
│                       BRANCH MANAGEMENT                          │
└──────────────────────────────────────────────────────────────────┘

USER ROLE ASSIGNMENT:
─────────────────────

┌─ Admin User (super_admin/admin)
│  └─ bid: null
│  └─ Sees: ALL branches, ALL data
│  └─ Can: Override branch filters, see all inventory
│
└─ Regular User (sales/inventory)
   └─ bid: 'DUB' OR 'KUB' (assigned to one branch)
   └─ Default view: Only their assigned branch
   └─ Exception: Booking checks total inventory across ALL branches

INVENTORY AGGREGATION:
──────────────────────

  Item: "Conveyor Belt"
  ├─ DUB branch: qty = 5
  └─ KUB branch: qty = 3
  
  INVENTORY VIEW (Inventory.jsx):
    └─ Shows: 8 total (merged across branches)
    └─ Can see breakdown by clicking item
  
  BOOKING CHECK:
    ├─ Customer books: 7 units
    ├─ Total available: 8 (5 + 3 across branches)
    ├─ Shortage: 0
    └─ No PO created
  
  BOOKING CHECK 2:
    ├─ Customer books: 10 units
    ├─ Total available: 8 (5 + 3 across branches)
    ├─ Shortage: 2 ← CREATES PO for 2 units
    └─ Auto-generated PO visible to both branches

SALES ACROSS BRANCHES:
─────────────────────

  Scenario: User in DUB branch sells "Conveyor Belt"
    ├─ DUB has: 5 units
    ├─ Sales qty: 7 units ← MORE than DUB has!
    ├─ KUB has: 3 units (same item)
    
  Question: Can DUB user sell from KUB inventory?
    └─ Current logic: YES (searches all branches by item id)
    └─ Recommendation: May need per-branch sales enforcement

REPORTING:
──────────

  Dashboard (Admin view):
    ├─ Filter: "All branches"
    │  └─ Shows combined metrics
    │
    ├─ Filter: "DUB"
    │  └─ Shows only DUB sales, inventory, expenses
    │
    └─ Filter: "KUB"
       └─ Shows only KUB sales, inventory, expenses

  Sales Report:
    ├─ DUB: 50,000 AED (May-2024)
    └─ KUB: 35,000 AED (May-2024)
    └─ Total: 85,000 AED
```

---

## 9. ERROR HANDLING & RESILIENCE

### **Sync Failure & Recovery**

```
┌──────────────────────────────────────────────────────────────────┐
│              ERROR HANDLING & RETRY STRATEGY                     │
└──────────────────────────────────────────────────────────────────┘

SCENARIO: Network error while saving sale
──────────────────────────────────────────

  User clicks "Save Sale"
      │
      └─→ Dispatch ADD_SALE
          ├─ State updated IMMEDIATELY (optimistic)
          │  └─ Sale visible in list
          │  └─ Inventory updated on screen
          │
          └─→ Async sync.js.syncAction() starts
              │
              ├─→ Attempt 1: upsert sale to Supabase
              │   └─ Network timeout ✗
              │   └─ ERROR: Network error
              │   └─ Retry decision: YES (attempt 1 of 3)
              │   └─ Wait: 400ms
              │
              ├─→ Attempt 2: Retry after 400ms
              │   └─ upsert sale to Supabase
              │   └─ Connection refused ✗
              │   └─ ERROR: Connection refused
              │   └─ Retry decision: YES (attempt 2 of 3)
              │   └─ Wait: 800ms
              │
              ├─→ Attempt 3: Retry after 800ms
              │   └─ upsert sale to Supabase
              │   └─ SUCCESS ✓
              │   └─ Sale persisted
              │   └─ Move to next operation
              │
              └─→ upsertMany inventory items
                  └─ Same retry logic (3 attempts, exponential backoff)

RESULT:
  ✓ Sale eventually persisted
  ✓ User data never lost (stayed in state)
  ✓ Automatic recovery without user intervention
  ✗ No Toast notification (silent success)
  └─ Recommendation: Add feedback toast "Retrying..."

SCENARIO: All retries failed (Network completely down)
─────────────────────────────────────────────────────

  After 3 failed attempts (3200ms total wait):
      │
      └─→ sync.js gives up
          │
          ├─→ Log error to console
          ├─→ Show Toast: "Error saving sale. Please check connection"
          │
          └─→ Data remains in local state
              ├─ User can see their sale in the list
              ├─ User can continue working offline
              ├─ When network restores, next dispatch will retry
              └─ Recommendation: Add "Retry" button to Toast

REALTIME RECONNECTION:
───────────────────────

  Supabase WebSocket connection lost
      │
      └─→ realtime.js.startRealtime() detects CHANNEL_ERROR
          │
          ├─→ Attempt 1: Reconnect immediately
          │   └─ Fails ✗
          │   └─ Wait: 1000ms
          │
          ├─→ Attempt 2: Wait 1s, retry
          │   └─ Fails ✗
          │   └─ Wait: 2000ms
          │
          ├─→ Attempt 3: Wait 2s, retry
          │   └─ Fails ✗
          │   └─ Wait: 4000ms
          │
          ├─→ Attempt 4: Wait 4s, retry
          │   └─ Fails ✗
          │   └─ Wait: 8000ms
          │
          ├─→ Attempt 5: Wait 8s, retry
          │   └─ SUCCESS ✓
          │   └─ Reset backoff counter
          │   └─ Resume receiving realtime updates
          │
          └─→ If Attempt 8+ (max attempts reached)
              └─ Stop retrying
              └─ Show error in UI
              └─ User must manually reload app

AUDIT LOG PRESERVATION:
──────────────────────

  Even if sync fails, audit log is created locally
    └─ When connection restores, audit is uploaded
    └─ Ensures transaction history is never lost
```

---

## 10. KEY BUSINESS LOGIC RULES

```javascript
╔═════════════════════════════════════════════════════════════════════╗
║                  CRITICAL BUSINESS LOGIC RULES                      ║
╚═════════════════════════════════════════════════════════════════════╝

1. SALES RULE
   ─────────────
   When a sale is recorded:
   • Inventory qty MUST be deducted IMMEDIATELY
   • No delays or optional deduction
   • If sale is deleted → inventory restored (no permanent loss)
   • Profit calculation: qty * (unitPrice - costPrice)
   • Payment tracking: amountPaid vs total (balance = total - amountPaid)

2. BOOKING RULE
   ─────────────
   When a booking is created:
   • Check total inventory ACROSS ALL BRANCHES (not single branch)
   • Sum of (inv.qty for all branches of same item)
   • If total < booking qty → AUTO-CREATE PURCHASE ORDER
   • PO linked to booking via bookingId
   • Booking does NOT deduct inventory (only sales do)

3. GOODS RECEIVED RULE
   ────────────────────
   When goods arrive (GRN created):
   • Inventory qty MUST be incremented
   • Corresponding purchase orders marked 'fulfilled'
   • Check ALL pending/confirmed bookings
   • If booking now has sufficient stock → status: pending → confirmed
   • Update audit log with GRN details

4. PURCHASE ORDER RULE
   ────────────────────
   PO lifecycle:
   • pending (awaiting user confirmation)
   • ordered (placed with supplier)
   • received (goods in warehouse)
   • fulfilled (added to inventory, booking can use)
   • Auto-generated POs: created from ADD_BOOKING when stock shortage
   • Manual POs: created by user in Purchase.jsx

5. BRANCH VISIBILITY RULE
   ──────────────────────
   • Admin (bid = null) → sees ALL branches
   • Regular user (bid = 'DUB' | 'KUB') → sees only their branch
   • EXCEPTION: Inventory aggregation for bookings checks ALL branches
   • Sales within branch: sells from any branch's inventory

6. AUDIT LOG RULE
   ───────────────
   Every transaction auto-logged:
   • WHO (user.id)
   • WHAT (action type)
   • WHEN (timestamp)
   • DETAIL (affected records, quantities)
   • Capped at 500 entries (oldest pruned to prevent memory bloat)

7. VAT & PRICING RULE
   ───────────────────
   Sale calculation:
   subtotal = sum(qty * unitPrice)
   vat = subtotal * vatPercentage / 100
   discount = optional
   total = subtotal + vat - discount
   
   Note: VAT added AFTER discount (check accounting rules)

8. PAYMENT RULE
   ─────────────
   Payment methods: Cash, Transfer, POS, Cheque, Credit
   • Partial payment allowed (amountPaid < total)
   • Balance = total - amountPaid
   • If balance > 0 → customer owes money (credit)
   • Full payment triggers sale confirmation

9. RESTOCK RULE
   ─────────────
   Manual restock (not from GRN):
   • User increases item qty in Inventory.jsx
   • No cost tracking (assumes internal reallocation)
   • Audit log created with "RESTOCK" action
   • Useful for corrections/adjustments

10. DELETE RECOVERY RULE
    ────────────────────
    Deleted records moved to recycle_bin:
    • Soft delete: data preserved with _deletedAt, _deletedBy
    • Can be restored (undelete function)
    • Hard delete: requires admin approval
    • Never permanently lost without audit trail
```

---

## 11. COMPLETE PAGE WORKFLOW REFERENCE

```
DASHBOARD.jsx
└─ Purpose: KPI & metrics dashboard
├─ Read-only (no modifications)
├─ Displays:
│  ├─ Total Revenue (sum of all sales.total)
│  ├─ Total Expenses (sum of expenses.amount)
│  ├─ Net Profit (revenue - expenses)
│  ├─ Today's Sales & Revenue
│  ├─ Inventory metrics (count, low stock, out of stock)
│  ├─ Active bookings count
│  ├─ Unique customers count
│  ├─ Commission totals
│  ├─ Top 10 most-sold items
│  └─ Branch-aware filtering
└─ Actions: None (read-only)

SALES.jsx
└─ Purpose: Record customer sales
├─ Key actions:
│  ├─ Search inventory items
│  ├─ Add item to sale with qty & price
│  ├─ Apply discount & VAT
│  ├─ Select payment method (Cash/Transfer/POS/Cheque/Credit)
│  ├─ Record payment amount
│  ├─ Save sale → Dispatch ADD_SALE
│  ├─ Edit sale → Dispatch UPDATE_SALE (restores old items, applies new deductions)
│  └─ Delete sale → Dispatch DELETE_SALE (restores inventory)
├─ Inventory impact:
│  └─ DEDUCT qty when sale created/updated
└─ Sync tables: sales, inventory, auditLog

INVENTORY.jsx
└─ Purpose: Manage stock & inventory levels
├─ Tab 1: Inventory Master
│  ├─ Display all items with qty, unit, price, minQty
│  ├─ Shows low-stock alerts (qty < minQty)
│  ├─ Shows out-of-stock items (qty = 0)
│  ├─ Actions:
│  │  ├─ Add new item → Dispatch ADD_ITEM
│  │  ├─ Update item details → Dispatch UPDATE_ITEM
│  │  ├─ Manual restock → Dispatch RESTOCK_ITEM (increment qty)
│  │  └─ Delete item → Dispatch DELETE_ITEM (soft delete to recycleBin)
│  └─ Qty changes from: Sales (decrease), Goods Received (increase), Restock (increase)
├─ Tab 2: General Record (Demand vs Supply)
│  ├─ Shows booking analysis per item
│  ├─ Displays "Goods to Order" (POs pending)
│  ├─ Displays "Goods for Sales" (current stock)
│  └─ Inventory impact: NO (read-only analysis)
└─ Sync tables: inventory, auditLog

BOOKED.jsx
└─ Purpose: Manage customer bookings/orders
├─ Two input modes:
│  ├─ Full Factory Template (75+ pre-configured items)
│  └─ Custom booking (manual item selection)
├─ Key actions:
│  ├─ Create booking → Dispatch ADD_BOOKING
│  │  └─ AUTO-CREATES POs if stock shortage
│  ├─ Update booking → Dispatch UPDATE_BOOKING
│  │  └─ Regenerates POs based on new items/quantities
│  ├─ Mark delivered → Update booking.status: confirmed → delivered
│  └─ Delete booking → Dispatch DELETE_BOOKING
├─ Booking statuses: pending → confirmed → delivered (or cancelled)
├─ Inventory impact: NO DIRECT (only creates POs)
│  └─ Exception: When POs fulfilled from goods_received
└─ Sync tables: bookings, purchaseList, auditLog

PURCHASE.jsx
└─ Purpose: Manage purchase orders to suppliers
├─ Three views:
│  ├─ View 1: All Purchase Orders (status: pending/ordered/received/fulfilled)
│  ├─ View 2: Orderable Items (items with shortages from active bookings)
│  └─ View 3: Booked Not In Stock (aggregate view of shortages)
├─ Key actions:
│  ├─ Create manual PO → Dispatch ADD_PURCHASE
│  ├─ Update PO status (pending → ordered → received → fulfilled) → UPDATE_PURCHASE_STATUS
│  ├─ Bulk sync → Dispatch SYNC_PURCHASES_FROM_BOOKINGS
│  │  └─ Scans all pending/confirmed bookings
│  │  └─ Creates missing POs for items with shortages
│  └─ Delete PO → Dispatch DELETE_PURCHASE
├─ Inventory impact: NO DIRECT
│  └─ Exception: When GRN received, inventory incremented + PO marked fulfilled
└─ Sync tables: purchaseList, auditLog

GOODS.jsx
└─ Purpose: Receive goods from suppliers (GRN - Goods Received Notes)
├─ Key actions:
│  ├─ Create GRN → Dispatch RECEIVE_GOODS
│  │  ├─ Inputs: supplier, invoice#, branch, items received, unit costs
│  │  ├─ Inventory INCREMENTED for each item
│  │  ├─ PO status updated: ordered → received → fulfilled
│  │  ├─ Bookings re-checked (pending → confirmed if now in stock)
│  │  └─ Total cost calculated & tracked
│  ├─ Update GRN → Dispatch UPDATE_GRN
│  └─ Delete GRN → Dispatch DELETE_GRN (restore inventory)
├─ Inventory impact:
│  └─ INCREMENT qty when GRN created
└─ Sync tables: goodsReceived, inventory, purchaseList, bookings, auditLog

CUSTOMERS.jsx
└─ Purpose: Manage customer master data
├─ Actions:
│  ├─ Add customer → Dispatch ADD_CUSTOMER
│  ├─ Update customer → Dispatch UPDATE_CUSTOMER
│  └─ Delete customer → Dispatch DELETE_CUSTOMER
├─ Inventory impact: NONE
└─ Sync tables: customers, auditLog

EXPENSES.jsx
└─ Purpose: Track business expenses
├─ Actions:
│  ├─ Add expense → Dispatch ADD_EXPENSE
│  ├─ Update expense → Dispatch UPDATE_EXPENSE
│  └─ Delete expense → Dispatch DELETE_EXPENSE
├─ Categories: Rent, Utilities, Transport, etc.
├─ Inventory impact: NONE (separate from sales)
└─ Sync tables: expenses, auditLog

SETTINGS.jsx
└─ Purpose: Configure app settings
├─ Settings:
│  ├─ Business name, RC, phone, email, address
│  ├─ VAT percentage
│  ├─ Currency code
│  ├─ Low stock threshold
│  ├─ Notification preferences
│  └─ User management
├─ Actions:
│  ├─ Update setting → Dispatch UPDATE_SETTING
│  └─ Add/remove users → Dispatch ADD_USER / DELETE_USER
├─ Inventory impact: NONE
└─ Sync tables: appSettings, appUsers, auditLog

COMMISSION.jsx
└─ Purpose: Track sales commissions
├─ Displays: Sales commissions per user/item
├─ Inventory impact: NONE
└─ Read-only (commissions calculated from sales)

GENERALRECORD.jsx & REPORTS.jsx
└─ Purpose: Advanced reporting & analytics
├─ Inventory impact: NONE (read-only analysis)
└─ Various report types & filters

LOGIN.jsx & LOGINGMAIL.jsx
└─ Purpose: User authentication
├─ Sessions managed via Supabase auth
├─ Inventory impact: NONE
└─ Sets user.id, user.role, user.bid
```

---

## 12. SUMMARY: TRANSACTION FLOW ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLETE FLOW SUMMARY                            │
└─────────────────────────────────────────────────────────────────────┘

USER INITIATES ACTION
    ↓
OPTIMISTIC STATE UPDATE (React state, UI updates immediately)
    ↓
BACKGROUND SYNC (async, with retry logic)
    ↓
DATABASE PERSISTENCE (Supabase upsert)
    ↓
REALTIME BROADCAST (WebSocket to all connected clients)
    ↓
OTHER USERS' UI UPDATES (see changes in real-time)

KEY INVENTORY IMPACTS:
  • SALES: qty DECREASES (deduction)
  • GOODS_RECEIVED: qty INCREASES (restocking)
  • RESTOCK: qty INCREASES (manual adjustment)
  • BOOKINGS: NO direct impact (creates POs instead)
  • PURCHASES: NO direct impact (creation/tracking only)

KEY LINKING MECHANISM:
  • Bookings → Purchase Orders (auto-generated via ADD_BOOKING)
  • Purchase Orders → Goods Received (via GRN creation)
  • Goods Received → Booking Status Update (confirmed when stock available)
  • Sales → Inventory Deduction (immediate upon ADD_SALE)

DATA CONSISTENCY:
  • All calculations done in reducer (single source of truth)
  • Sync failures don't lose data (stays in local state + retry)
  • Realtime broadcasts ensure all users synchronized
  • Audit log creates complete transaction history

SCALE HANDLING:
  • Large collections limited: sales/bookings max 500 records fetched
  • Inventory/suppliers: full fetch (assumed small)
  • Chunked upserts: 50 items per batch
  • Audit log capped: 500 entries max

ERROR RESILIENCE:
  • 3 retry attempts per sync operation
  • Exponential backoff: 400ms → 800ms → 1600ms
  • Realtime reconnection: up to 8 attempts with max 60s backoff
  • User data never lost (always in local state)
```

This comprehensive document maps the entire transaction flow from Sales → Inventory Deduction → Bookings → Purchase Orders → Goods Received back to fulfillment. Each page has a specific role in the ecosystem, and the state management ensures real-time collaboration across multiple users and branches.

