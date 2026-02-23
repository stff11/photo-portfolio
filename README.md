# Photography Portfolio - Setup Guide

A minimal, elegant photography portfolio with masonry gallery, tag filtering, lightbox viewing, and admin management.

## Features

- 📸 **Masonry Gallery** - Responsive grid layout with lazy loading
- 🏷️ **Tag Filtering** - Click tags to filter photos, multiple tag selection
- 🔍 **Lightbox Viewer** - Full-screen viewing with keyboard navigation
- 🔐 **Admin Authentication** - Secure login for photo management
- ☁️ **Cloud Storage** - Images hosted on Cloudinary with automatic optimization
- 📊 **Database** - Photo metadata stored in Supabase with RLS
- ✨ **Beautiful Design** - Refined typography and elegant aesthetics

## Tech Stack

- **Frontend**: React with inline styles
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Image Hosting**: Cloudinary
- **Styling**: Inline CSS with Google Fonts

## Setup Instructions

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the `supabase-schema.sql` file
3. Go to **Authentication** > **Providers** and ensure Email is enabled
4. Create an admin user:
   - Go to **Authentication** > **Users**
   - Click **Add user** > **Create new user**
   - Enter email and password (this will be your admin account)
5. Get your credentials from **Settings** > **API**:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon/Public key (starts with `eyJ...`)

### 2. Cloudinary Setup

1. Create a free account at [cloudinary.com](https://cloudinary.com)
2. Go to **Dashboard** and note:
   - Cloud Name (e.g., `your-cloud-name`)
3. Go to **Settings** > **Upload** > **Upload Presets**
4. Create a new unsigned upload preset:
   - Click **Add upload preset**
   - Set **Signing Mode** to **Unsigned**
   - Set **Folder** (optional, e.g., `portfolio`)
   - Save and note the **Preset name**

### 3. Configure the Application

Update the configuration in `photo-portfolio.jsx`:

```javascript
// Line 5-7: Supabase config
const supabase = createClient(
  'https://YOUR-PROJECT-ID.supabase.co',  // Replace with your Project URL
  'YOUR-ANON-KEY'                          // Replace with your Anon key
);

// Line 10-11: Cloudinary config
const CLOUDINARY_CLOUD_NAME = 'your-cloud-name';      // Replace with your Cloud Name
const CLOUDINARY_UPLOAD_PRESET = 'your-upload-preset'; // Replace with your Preset name
```

### 4. Install Dependencies

```bash
npm install react react-dom @supabase/supabase-js
```

### 5. Add Google Fonts

Add this to your HTML `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
```

### 6. Run the Application

```bash
npm start
```

## Usage Guide

### For Visitors (Public Access)

1. **Browse Gallery**: Photos display in a masonry grid
2. **Filter by Tags**: Click tag buttons at the top to filter photos
3. **View Photos**: Click any photo to open the lightbox
4. **Navigate**: Use arrow keys or on-screen buttons to browse

### For Admin

1. **Login**: Click "Login" in the header and use your admin credentials
2. **Upload Photos**:
   - Click "+ UPLOAD" button
   - Select image file
   - Add title, description, and tags (comma-separated)
   - Click "Upload"
3. **Edit Photos**:
   - Hover over any photo
   - Click the ✏️ (pencil) icon
   - Update metadata
   - Click "Save Changes"
4. **Delete Photos**:
   - Hover over any photo
   - Click the 🗑️ (trash) icon
   - Confirm deletion

## Database Schema

### Tables

**photos**
- `id` (UUID, primary key)
- `cloudinary_url` (text) - Full Cloudinary URL
- `cloudinary_public_id` (text) - Cloudinary asset ID
- `title` (text) - Photo title
- `description` (text) - Photo description
- `width` (integer) - Original width
- `height` (integer) - Original height
- `created_at` (timestamp)
- `updated_at` (timestamp)

**tags**
- `id` (UUID, primary key)
- `name` (text, unique) - Tag name
- `created_at` (timestamp)

**photo_tags** (junction table)
- `id` (UUID, primary key)
- `photo_id` (UUID, foreign key)
- `tag_id` (UUID, foreign key)
- `created_at` (timestamp)

### Row Level Security (RLS)

- **Public read access** for all tables
- **Admin-only write access** (insert, update, delete)

## Cloudinary Transformations

The app uses automatic Cloudinary transformations:

**Thumbnails** (gallery view):
```
w_600,h_600,c_fill,f_auto,q_auto
```
- Width/height: 600px
- Crop: Fill
- Format: Auto (WebP/AVIF when supported)
- Quality: Auto

**Full-size** (lightbox view):
```
w_2000,f_auto,q_auto
```
- Max width: 2000px
- Format: Auto
- Quality: Auto

## Customization

### Change Color Scheme

Update the inline styles in the component:

```javascript
// Background color
backgroundColor: '#fafaf8'  // Warm off-white

// Text color
color: '#1a1a1a'  // Near black

// Primary accent
backgroundColor: '#1a1a1a'  // Dark for buttons
```

### Change Typography

Update the font families:

```javascript
// Body font
fontFamily: '"Instrument Serif", "Crimson Pro", Georgia, serif'

// Display font (headings)
fontFamily: '"Cormorant Garamond", "Playfair Display", serif'
```

### Adjust Masonry Layout

Modify the columns configuration:

```javascript
columns: 'auto 300px'  // Change 300px to desired column width
```

## Important Notes

### Security

1. **Never expose Cloudinary API secrets** in frontend code
2. For deletion to work properly, you need to:
   - Set up a backend endpoint to handle Cloudinary deletions securely
   - Or use Cloudinary's auto-upload feature with Supabase storage
3. The current delete function is incomplete - implement server-side deletion

### Production Checklist

- [ ] Set up proper Cloudinary deletion via backend
- [ ] Configure Supabase production settings
- [ ] Enable email verification for admin accounts
- [ ] Set up custom domain
- [ ] Configure CORS properly
- [ ] Add analytics if needed
- [ ] Test on multiple devices and browsers
- [ ] Optimize images before upload
- [ ] Set up automated backups

### Performance Tips

1. **Lazy Loading**: Images load as you scroll
2. **Responsive Images**: Cloudinary serves optimal sizes
3. **Format Optimization**: Auto WebP/AVIF support
4. **Caching**: Cloudinary CDN handles this automatically

## Troubleshooting

### Images not loading
- Check Cloudinary Cloud Name is correct
- Verify upload preset is set to "Unsigned"
- Check browser console for CORS errors

### Can't login
- Verify Supabase credentials are correct
- Check that email provider is enabled in Supabase
- Ensure admin user exists in Supabase Auth

### Upload fails
- Check Cloudinary upload preset exists and is unsigned
- Verify file size is within Cloudinary limits (free tier: 10MB)
- Check browser console for errors

### Tags not showing
- Verify the photo_tags junction table has entries
- Check that the tags table has the tag names
- Review the SQL query in fetchPhotos()

## Future Enhancements

Potential features to add:

- [ ] Image cropping/editing before upload
- [ ] Bulk upload
- [ ] Photo collections/albums
- [ ] Public commenting (with moderation)
- [ ] Social sharing
- [ ] Search functionality
- [ ] Analytics dashboard
- [ ] Export portfolio as PDF
- [ ] Multiple admin users with roles
- [ ] Image metadata (EXIF) display

## License

This is a template project. Customize and use as you wish!

## Support

For issues with:
- **Supabase**: [docs.supabase.com](https://docs.supabase.com)
- **Cloudinary**: [cloudinary.com/documentation](https://cloudinary.com/documentation)
- **React**: [react.dev](https://react.dev)
