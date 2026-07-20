# Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste the contents of
   `supabase/migrations/202607200001_create_library_items.sql`, and run it.
3. Open **Authentication > Users > Add user** and create:

   - Email: `demo@bepflowai.app`
   - Password: `bepflowdemo`
   - Auto-confirm user: enabled

4. In **Authentication > URL Configuration**, set the Site URL to
   `https://qwencluod.vercel.app` and add `http://localhost:5173/**` as a
   development redirect URL.
5. Copy the Project URL and publishable key from the Supabase **Connect** panel.
6. Add these variables to local `.env` and to the Vercel project for Production,
   Preview, and Development:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

7. Redeploy Vercel. Sign in with username `demo` and password
   `bepflowdemo`.

The UI maps the username `demo` to `demo@bepflowai.app`. Never put the
Supabase `service_role` or secret key in a `VITE_` variable.
