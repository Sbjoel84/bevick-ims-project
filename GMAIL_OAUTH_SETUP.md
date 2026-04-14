# Gmail OAuth Setup Guide

This application now uses **Gmail OAuth** for user authentication instead of demo accounts. Here's how to set it up:

## Step 1: Configure Google OAuth in Supabase

1. **Go to Supabase Dashboard**
   - Navigate to your project: https://app.supabase.com
   - Go to **Authentication** → **Providers**

2. **Enable Google Provider**
   - Find "Google" in the provider list
   - Click to expand the Google provider
   - Toggle "Enabled" to ON

3. **Get Google OAuth Credentials**
   - You need a Google Cloud Project. If you don't have one:
     - Go to https://console.cloud.google.com/
     - Create a new project (e.g., "Bevick IMS")
     - Enable the Google+ API
   
   - In Google Cloud Console:
     - Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
     - Application type: **Web application**
     - Add Authorized redirect URIs:
       ```
       https://vqhxqnhqylxskwpxdhun.supabase.co/auth/v1/callback
       ```
       (Replace the domain with your actual Supabase project domain)
     - Copy the **Client ID** and **Client Secret**

4. **Add to Supabase**
   - In Supabase Authentication → Google Provider:
     - Paste **Client ID**
     - Paste **Client Secret**
     - Click "Save"

## Step 2: Configure Site URL

In Supabase Dashboard → **Project Settings** → **API**:
- Set **Site URL** to your development/production domain:
  ```
  http://localhost:5174  (for development)
  https://yourdomain.com (for production)
  ```

## Step 3: Understand the New Flow

### Before (DEMO_USERS):
```
User enters email/password → Checked against hardcoded DEMO_USERS
```

### After (Gmail OAuth):
```
User clicks "Sign in with Google" 
  → redirects to Google login
  → Google redirects back to your app
  → App checks if user exists in app_users table
  → If new user: Asks for profile (phone, role, branch)
  → User saved as "pending" awaiting admin approval
  → Admin approves user → User can login
```

## Step 4: Test the Flow

1. **Start the dev server**:
   ```bash
   cd frontend
   npm run dev
   ```

2. **Open http://localhost:5174**

3. **Click "Sign in with Google"**
   - You'll be redirected to Google login
   - After authenticating, you'll be asked to complete your profile
   - Your account will be created with "pending" status

4. **Admin Approves**
   - An admin logs in to the Admin Panel
   - Goes to "Pending" users tab
   - Clicks approve next to your user
   - Your status changes to "active"

5. **Now You Can Login**
   - Sign in again with Google
   - You'll be logged into the dashboard

## Step 5: Database Schema

Make sure you have these tables in Supabase:

### app_users
```sql
id, data (jsonb), branch
-- data includes: id, em, name, phone, role, bid, picture, status, registeredAt, initials
```

### pending_users
```sql
id, data (jsonb)
-- Same structure as app_users, but status is always 'pending'
```

## Troubleshooting

### "Failed to sign in with Google"
- Check that Google OAuth is enabled in Supabase
- Verify Client ID and Client Secret are correct
- Check that Site URL is configured correctly

### "This email is already registered"
- User might already be in the system
- Check app_users and pending_users tables

### Users not showing up in Admin Panel
- Make sure users are in app_users table (not pending_users)
- Check their status is 'active'

## File Changes

### New Files:
- `src/pages/LoginGmail.jsx` - New Gmail OAuth login component

### Modified Files:
- `src/App.jsx` - Switch from Login to LoginGmail
- `src/lib/db.js` - Removed DEMO_USERS upsert logic
- `src/pages/Login.jsx` - Old file (no longer used)

### Removed Dependency:
- DEMO_USERS from src/data/users.js is no longer used in application flow

## Environment Variables

No additional .env variables needed. All configuration is done in Supabase Dashboard.

## Next Steps

1. ✅ Set up Google OAuth in Supabase (see Step 1 above)
2. ✅ Configure Site URL (see Step 2 above)
3. ✅ Test the registration flow
4. ✅ Approve users in Admin Panel
5. ✅ Users can now login with Gmail
