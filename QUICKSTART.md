# Quick Start Guide

Get your photography portfolio running in 10 minutes!

## Prerequisites

- Node.js 16+ installed
- A Supabase account (free tier works)
- A Cloudinary account (free tier works)

## Step-by-Step Setup

### 1️⃣ Setup Supabase (3 minutes)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to be ready
3. Go to **SQL Editor** and paste the contents of `supabase-schema.sql`
4. Click **Run** to create tables
5. Go to **Authentication** → **Users** → **Add user**
   - Create your admin account with email/password
6. Go to **Settings** → **API** and copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ`)

### 2️⃣ Setup Cloudinary (2 minutes)

1. Go to [cloudinary.com](https://cloudinary.com) and create account
2. From dashboard, note your **Cloud name** (top left)
3. Go to **Settings** → **Upload** → **Upload presets**
4. Click **Add upload preset**:
   - **Preset name**: `portfolio_unsigned` (or your choice)
   - **Signing Mode**: **Unsigned** ⚠️ Important!
   - **Folder**: `portfolio` (optional)
   - Save preset

### 3️⃣ Configure Application (1 minute)

Open `src/photo-portfolio.jsx` and update these lines:

**Lines 5-7 (Supabase):**
```javascript
const supabase = createClient(
  'YOUR_PROJECT_URL_HERE',    // Paste your Supabase URL
  'YOUR_ANON_KEY_HERE'        // Paste your anon key
);
```

**Lines 10-11 (Cloudinary):**
```javascript
const CLOUDINARY_CLOUD_NAME = 'your-cloud-name';      // Your Cloud name
const CLOUDINARY_UPLOAD_PRESET = 'portfolio_unsigned'; // Your preset name
```

### 4️⃣ Install & Run (4 minutes)

```bash
# Install dependencies
npm install

# Start development server
npm start
```

Your portfolio will open at `http://localhost:3000` 🎉

### 5️⃣ First Login

1. Click **Login** in top-right
2. Enter the email/password you created in Supabase
3. Click **+ UPLOAD** to add your first photo!

## Testing the Upload Flow

1. **Login** with your admin credentials
2. Click **+ UPLOAD**
3. Select an image from your computer
4. Fill in:
   - Title: "Mountain Sunset"
   - Description: "Golden hour in the Alps"
   - Tags: `landscape, sunset, mountains`
5. Click **Upload**
6. Photo appears in gallery!

## Common Issues

### ❌ "Invalid API key" error
- Double-check your Supabase URL and anon key
- Make sure there are no extra spaces when copying

### ❌ Upload fails silently
- Verify Cloudinary preset is set to **Unsigned**
- Check Cloud name is correct (case-sensitive)
- Try a smaller image first (<5MB)

### ❌ Can't login
- Make sure you created the admin user in Supabase
- Check email/password are correct
- Verify Email auth is enabled in Supabase

### ❌ Photos don't show after upload
- Check browser console for errors
- Verify Supabase RLS policies were created (run the SQL schema)
- Try refreshing the page

## Next Steps

Once it's working:

1. **Upload your portfolio** - Add 10-20 of your best photos
2. **Organize with tags** - Use consistent tag names (e.g., "portrait", "landscape", "architecture")
3. **Customize design** - Change colors and fonts in the component
4. **Deploy** - Use Vercel, Netlify, or your preferred host

## Project Structure

```
photo-portfolio/
├── public/
│   └── index.html          # HTML template with fonts
├── src/
│   ├── index.js            # React entry point
│   └── photo-portfolio.jsx # Main component (CONFIGURE THIS)
├── package.json            # Dependencies
├── supabase-schema.sql     # Database schema
└── README.md               # Full documentation
```

## Deploy to Production

### Option 1: Vercel (Easiest)

```bash
npm install -g vercel
vercel
```

### Option 2: Netlify

1. Push code to GitHub
2. Connect repo to Netlify
3. Build command: `npm run build`
4. Publish directory: `build`

### Option 3: Manual

```bash
npm run build
# Upload the 'build' folder to your host
```

## Security Notes

⚠️ **Important**: The current implementation has a limitation with photo deletion:

- Deletion from Cloudinary requires API secrets
- These should **never** be exposed in frontend code
- For production, set up a backend API endpoint to handle deletions

For now, you can:
1. Delete photos from Supabase (metadata removed)
2. Manually clean up Cloudinary media library
3. Or implement a secure backend deletion endpoint

## Need Help?

Check the full **README.md** for:
- Detailed configuration options
- Customization guide
- Database schema explanation
- Troubleshooting tips
- Advanced features

Happy building! 📸
