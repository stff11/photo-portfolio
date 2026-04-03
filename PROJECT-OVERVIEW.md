# Photography Portfolio - Complete React Project

## 📦 What You Have

A complete, production-ready React photography portfolio application with:

- **Frontend**: React single-page application
- **Authentication**: Supabase Auth for admin login
- **Database**: Supabase PostgreSQL with Row Level Security
- **Image Hosting**: Cloudinary with automatic optimization
- **Features**: Masonry gallery, tag filtering, lightbox, admin CRUD operations

## 📁 Project Files

```
photo-portfolio/
├── src/
│   ├── index.js                # React entry point
│   └── photo-portfolio.jsx     # Main component (31KB, 1000+ lines)
├── public/
│   └── index.html              # HTML template with Google Fonts
├── package.json                # Dependencies list
├── supabase-schema.sql         # Database schema (run in Supabase)
├── QUICKSTART.md               # 10-minute setup guide
└── README.md                   # Complete documentation
```

## 🚀 How to Use These Files

### Step 1: Create Project Directory

```bash
mkdir my-photo-portfolio
cd my-photo-portfolio
```

### Step 2: Copy Files

Copy all the downloaded files into your project directory:
- `src/` folder (with index.js and photo-portfolio.jsx)
- `public/` folder (with index.html)
- `package.json`
- `supabase-schema.sql`
- `QUICKSTART.md` and `README.md`

### Step 3: Setup Services

1. **Supabase** (3 minutes):
   - Create account at supabase.com
   - Create new project
   - Run `supabase-schema.sql` in SQL Editor
   - Create admin user in Authentication
   - Copy Project URL and anon key

2. **Cloudinary** (2 minutes):
   - Create account at cloudinary.com
   - Note your Cloud Name
   - Create unsigned upload preset
   - Note the preset name

### Step 4: Configure

Edit `src/photo-portfolio.jsx`:

**Lines 5-7:**
```javascript
const supabase = createClient(
  'https://your-project.supabase.co',  // ← Paste your Supabase URL
  'your-anon-key'                      // ← Paste your anon key
);
```

**Lines 10-11:**
```javascript
const CLOUDINARY_CLOUD_NAME = 'your-cloud-name';      // ← Your Cloud Name
const CLOUDINARY_UPLOAD_PRESET = 'your-upload-preset'; // ← Your preset
```

### Step 5: Install & Run

```bash
npm install
npm start
```

Your portfolio opens at `http://localhost:3000`! 🎉

## 🎨 Design Features

**Elegant Minimalism:**
- Sophisticated serif typography (Cormorant Garamond + Instrument Serif)
- Warm off-white background (#fafaf8)
- Clean, gallery-focused layout
- Smooth transitions and hover effects

**User Experience:**
- Responsive masonry grid (1-4 columns)
- Tag-based filtering
- Full-screen lightbox with keyboard navigation
- Lazy loading for performance
- Admin controls visible only on hover

## 🔑 Key Components

### Main Component (`src/photo-portfolio.jsx`)

The 31KB React component includes:

1. **State Management**:
   - Photos, tags, filters
   - Auth state
   - Modal states (login, upload, edit, lightbox)

2. **Supabase Integration**:
   - Authentication
   - Photo CRUD operations
   - Tag management
   - Real-time data fetching

3. **Cloudinary Integration**:
   - Direct browser uploads
   - Automatic image optimization
   - Responsive URL generation

4. **UI Features**:
   - Masonry gallery layout
   - Tag filter bar
   - Lightbox viewer
   - Upload/edit modals
   - Admin controls

### Database Schema (`supabase-schema.sql`)

Three tables with Row Level Security:
- **photos**: Cloudinary URLs and metadata
- **tags**: Unique tag names
- **photo_tags**: Many-to-many junction table

Public read access, admin-only write access.

## 🛠️ Development

### Available Scripts

```bash
npm start       # Development server (localhost:3000)
npm run build   # Production build
npm test        # Run tests
```

### Customization

**Change Colors:**
Edit inline styles in `photo-portfolio.jsx`:
- `backgroundColor: '#fafaf8'` - Main background
- `color: '#1a1a1a'` - Text color
- `backgroundColor: '#1a1a1a'` - Buttons/accents

**Change Fonts:**
Update font families in the component and add fonts to `public/index.html`

**Adjust Layout:**
Modify masonry columns: `columns: 'auto 300px'` (change 300px)

## 📱 Responsive Design

- **Mobile** (< 600px): 1 column
- **Tablet** (600-900px): 2 columns  
- **Desktop** (900-1200px): 3 columns
- **Large** (> 1200px): 4 columns

## 🔒 Security Notes

**Current Limitations:**

1. **Photo Deletion**: The Cloudinary deletion in the code requires API secrets. For production:
   - Set up a backend API endpoint for secure deletion
   - Or manually clean Cloudinary media library
   - Photos can still be deleted from Supabase (metadata only)

2. **Admin Access**: Currently supports single admin user. For multi-admin:
   - Add user roles table
   - Update RLS policies
   - Add role-based UI controls

**Best Practices:**

- Never commit `.env` with real credentials
- Use environment variables in production
- Enable email verification for admin accounts
- Set up Supabase production settings
- Configure CORS properly

## 🚀 Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

### Netlify

1. Push to GitHub
2. Connect repo to Netlify
3. Build command: `npm run build`
4. Publish directory: `build`

### Environment Variables

Set these in your hosting platform:
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_CLOUDINARY_CLOUD_NAME`
- `REACT_APP_CLOUDINARY_UPLOAD_PRESET`

Then update the component to use `process.env.REACT_APP_*` instead of hardcoded values.

## 📊 Performance Features

- ✅ Lazy loading images
- ✅ Cloudinary automatic optimization (WebP/AVIF)
- ✅ Responsive image sizing
- ✅ CDN delivery (Cloudinary)
- ✅ Minimal JavaScript bundle
- ✅ CSS-only animations

## 🐛 Troubleshooting

**Build errors?**
- Ensure Node.js 16+ is installed
- Delete `node_modules` and `package-lock.json`, then `npm install` again

**Images not loading?**
- Check Cloudinary Cloud Name is correct
- Verify upload preset is "Unsigned"
- Check browser console for CORS errors

**Can't login?**
- Verify Supabase credentials
- Check admin user exists in Supabase Auth
- Ensure Email provider is enabled

**Upload fails?**
- Verify Cloudinary preset is unsigned
- Check file size (free tier: 10MB limit)
- Look for errors in browser console

## 📚 Documentation

- **QUICKSTART.md**: Get running in 10 minutes
- **README.md**: Complete feature documentation
- **This file**: Project overview and setup

## 💡 Next Steps

Once your portfolio is live:

1. Upload 10-20 of your best photos
2. Create consistent tags (portrait, landscape, architecture, etc.)
3. Customize colors and fonts to match your brand
4. Share the link with clients and potential employers!

## 📞 Support Resources

- **Supabase Docs**: https://docs.supabase.com
- **Cloudinary Docs**: https://cloudinary.com/documentation
- **React Docs**: https://react.dev

---

**You're all set!** Follow QUICKSTART.md to get your portfolio running in 10 minutes. 🚀
