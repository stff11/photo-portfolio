import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import './photo-portfolio.css';

// Create React App uses REACT_APP_ prefix
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Environment Variables! Ensure your .env file has REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY");
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

const CLOUDINARY_CLOUD_NAME = process.env.REACT_APP_CLOUDINARY_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.REACT_APP_CLOUDINARY_PRESET;

// Compute SHA-256 hash of file for duplicate detection
const computeFileHash = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

// Extract location from EXIF data
const extractLocation = async (file) => {
  try {
    const exifData = await (await import('exifr')).default.parse(file, { gps: true });
    
    if (exifData && exifData.latitude && exifData.longitude) {
      console.log('GPS coordinates found:', exifData.latitude, exifData.longitude);
      
      // Reverse geocode to get location name
      const location = await reverseGeocode(exifData.latitude, exifData.longitude);
      return location;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting location:', error);
    return null;
  }
};

// Extract photo taken date from EXIF data
const extractPhotoDate = async (file) => {
  try {
    const exifData = await (await import('exifr')).default.parse(file, { 
      pick: ['DateTimeOriginal', 'CreateDate', 'DateTime'] 
    });
    
    // Try different date fields in order of preference
    const photoDate = exifData?.DateTimeOriginal || 
                     exifData?.CreateDate || 
                     exifData?.DateTime;
    
    if (photoDate) {
      console.log('Photo taken date found:', photoDate);
      return photoDate;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting photo date:', error);
    return null;
  }
};

// Extract keywords/tags from EXIF data
const extractExifKeywords = async (file) => {
  try {
    const exifData = await (await import('exifr')).default.parse(file, { 
      iptc: true,  // IPTC metadata includes keywords
      xmp: true    // XMP metadata also has keywords
    });
    
    // Try different keyword fields
    const keywords = 
      exifData?.Keywords || 
      exifData?.Subject || 
      exifData?.Category ||
      exifData?.SupplementalCategories ||
      [];
    
    if (keywords && keywords.length > 0) {
      console.log('EXIF keywords found:', keywords);
      return Array.isArray(keywords) ? keywords.join(', ') : keywords;
    }
    
    return '';
  } catch (error) {
    console.error('Error extracting keywords:', error);
    return '';
  }
};

// Reverse geocode coordinates to location name
const reverseGeocode = async (latitude, longitude) => {
  try {
    // Use our serverless function to avoid CORS issues
    const response = await fetch(
      `/.netlify/functions/geocode?lat=${latitude}&lon=${longitude}`
    );
    
    if (!response.ok) {
      console.error('Geocoding failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    const locationString = data.location;
    console.log('Location found:', locationString);
    return locationString;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

// Helper to capitalize first letter
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

// ---------------------------------------------------------------------------
// Cloudinary URL helpers
// All transformations live here so every request for the same image uses the
// exact same URL (=> browser + CDN cache hits instead of near-duplicate variants).
// ---------------------------------------------------------------------------
const cld = (url, transformation) =>
  url ? url.replace('/upload/', `/upload/${transformation}/`) : '';

// Grid thumbnails: responsive candidates, the browser picks one via srcset/sizes.
const THUMB_WIDTHS = [360, 540, 800, 1200];
// Phones: a ~600px-wide candidate is plenty for a grid card; the lightbox loads the big one.
const THUMB_SIZES = '(max-width: 768px) 62vw, 400px';
const getThumbUrl = (url, width = 800) =>
  cld(url, `c_limit,w_${width},q_auto:good,f_auto`);
const getThumbSrcSet = (url) =>
  THUMB_WIDTHS.map((w) => `${getThumbUrl(url, w)} ${w}w`).join(', ');

// Lightbox: size the image to the screen (in device pixels) but snap to a few
// fixed widths so we don't create dozens of one-off variants.
const FULL_WIDTH_BUCKETS = [1200, 1600, 2000, 2560, 3200];
const getFullUrl = (url) => {
  const dpr = window.devicePixelRatio || 1;
  const needed = window.innerWidth * dpr;
  const width =
    FULL_WIDTH_BUCKETS.find((b) => b >= needed) ||
    FULL_WIDTH_BUCKETS[FULL_WIDTH_BUCKETS.length - 1];
  return cld(url, `c_limit,w_${width},q_auto:good,f_auto`);
};

// Fetch + decode an image ahead of time. We keep a reference to the Image
// object (so it isn't garbage-collected mid-download) and cap how many we hold.
const prefetchCache = new Map();
const prefetchImage = (url) => {
  if (!url || prefetchCache.has(url)) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  if (img.decode) img.decode().catch(() => {});
  prefetchCache.set(url, img);
  if (prefetchCache.size > 12) {
    prefetchCache.delete(prefetchCache.keys().next().value);
  }
};

// The grid thumbnail the browser actually chose (so the lightbox placeholder is
// an instant cache hit whatever srcset candidate was picked).
const getCachedThumb = (photo) => {
  const el = document.querySelector(`img[data-photo-id="${photo.id}"]`);
  return (el && el.currentSrc) || getThumbUrl(photo.cloudinary_url);
};

// Runs when a grid thumbnail has loaded: fade it in, drop the placeholder
// sizing on the card, and tag its orientation (existing behaviour).
const onThumbLoad = (e) => {
  const img = e.currentTarget || e.target;
  if (img.naturalWidth > img.naturalHeight) img.classList.add('landscape');
  else if (img.naturalWidth < img.naturalHeight) img.classList.add('portrait');
  else img.classList.add('square');
  if (img.parentElement) img.parentElement.classList.add('loaded');
};

// ---------------------------------------------------------------------------
// Photo list cache (stale-while-revalidate): show the last known gallery
// instantly, then refresh from Supabase in the background.
// ---------------------------------------------------------------------------
// Grid thumbnail. Only starts downloading when it is near the viewport (IntersectionObserver),
// so on slow connections the first photos aren't fighting a dozen others for bandwidth.
function ThumbImg({ photo, index }) {
  const imgRef = useRef(null);
  const [near, setNear] = useState(index === 0);
  useEffect(() => {
    if (near) return undefined;
    const card = imgRef.current?.parentElement;
    if (!card || typeof IntersectionObserver === 'undefined') { setNear(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin: '250px 0px' });
    io.observe(card);
    return () => io.disconnect();
  }, [near]);
  return (
    <img
      ref={imgRef}
      src={near ? getThumbUrl(photo.cloudinary_url, 540) : undefined}
      srcSet={near ? getThumbSrcSet(photo.cloudinary_url) : undefined}
      sizes={THUMB_SIZES}
      data-photo-id={photo.id}
      alt={photo.title || 'Portfolio photo'}
      fetchpriority={index === 0 ? 'high' : 'auto'}
      decoding="async"
      onLoad={onThumbLoad}
      onError={(e) => e.currentTarget.parentElement?.classList.add('loaded')}
    />
  );
}

const PHOTOS_CACHE_KEY = 'portfolio:photos:v1';
const readPhotosCache = () => {
  try {
    const raw = localStorage.getItem(PHOTOS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const writePhotosCache = (photos) => {
  try {
    localStorage.setItem(PHOTOS_CACHE_KEY, JSON.stringify(photos));
  } catch {
    /* storage full or blocked - the cache is optional */
  }
};
const extractTags = (photos) => {
  const byId = new Map();
  photos.forEach((p) => p.tags.forEach((t) => byId.set(t.id, t)));
  return Array.from(byId.values());
};

const PhotoPortfolio = () => {
  const [initialPhotos] = useState(readPhotosCache);
  const [photos, setPhotos] = useState(initialPhotos);
  const [allTags, setAllTags] = useState(() => extractTags(initialPhotos));
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [loadedId, setLoadedId] = useState(null); // id of the photo whose full-size image has loaded
  const fullImgRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState([]); // Array of {type, value, label}
  const [sortOrder, setSortOrder] = useState('date-taken'); // 'date-taken', 'date-added', 'random', 'location'
  const [loading, setLoading] = useState(initialPhotos.length === 0); // skip the spinner when we have cached photos

  const year = new Date().getFullYear()  // returns the current year


  // Touchpoint for swiping photos
// --- 1. Swipe/Trackpad State & Refs ---
const touchStartX = useRef(null);
const scrollAccumulator = useRef(0); // For trackpad sensitivity
const isThrottled = useRef(false); // New: Prevents double-swipes from momentum
const touchMinDistance = 50;

// Mobile Touch Handlers
const handleTouchStart = (e) => {
  touchStartX.current = e.touches[0].clientX;
};

const handleTouchEnd = (e) => {
  if (!touchStartX.current) return;
  const distance = touchStartX.current - e.changedTouches[0].clientX;
  if (distance > touchMinDistance) nextPhoto();
  else if (distance < -touchMinDistance) prevPhoto();
  touchStartX.current = null;
};

// MacBook Trackpad Handler
const handleWheel = (e) => {
  if (!showLightbox || isThrottled.current) return;

  // We only care about horizontal movement (deltaX)
  if (Math.abs(e.deltaX) > 5) {
    scrollAccumulator.current += e.deltaX;

    const SENSITIVITY_THRESHOLD = 100;

    if (Math.abs(scrollAccumulator.current) > SENSITIVITY_THRESHOLD) {
      // Trigger the change
      if (scrollAccumulator.current > 0) {
        nextPhoto();
      } else {
        prevPhoto();
      }

      // --- THE FIX ---
      // 1. Reset accumulator immediately
      scrollAccumulator.current = 0;
      
      // 2. Start cooldown to ignore trackpad momentum
      isThrottled.current = true;
      setTimeout(() => {
        isThrottled.current = false;
      }, 600); // 600ms is the "sweet spot" for Mac trackpad inertia
    }
  } else {
    // If the user stops moving horizontally, bleed off the accumulator
    // This prevents "stale" scroll distance from staying in the memory
    scrollAccumulator.current *= 0.8; 
  }
};

// Ensure we reset everything when the lightbox opens or closes
useEffect(() => {
  if (!showLightbox) {
    scrollAccumulator.current = 0;
    isThrottled.current = false;
  }
}, [showLightbox]);

// Reset accumulator when photo changes
useEffect(() => {
  scrollAccumulator.current = 0;
}, [currentPhotoIndex]);
  
  // Check auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch photos
  // (No setLoading(true) here: refetching after an edit/delete must not tear down the grid.)
  const fetchPhotos = useCallback(async () => {
    const { data, error } = await supabase
      .from('photos')
      .select(`
        *,
        photo_tags(
          tags(id, name)
        )
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const uniquePhotos = {};
      data.forEach(photo => {
        if (!uniquePhotos[photo.id]) {
          uniquePhotos[photo.id] = {
            ...photo,
            tags: photo.photo_tags?.map(pt => pt.tags).filter(Boolean) || []
          };
        }
      });
      
      const processedPhotos = Object.values(uniquePhotos);
      setPhotos(processedPhotos);
      setAllTags(extractTags(processedPhotos));
      writePhotosCache(processedPhotos);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  useEffect(() => {
    return () => {
      uploadFiles.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [uploadFiles]);

  // Get all unique locations
  const allLocations = [...new Set(photos.map(p => p.location).filter(Boolean))];
  
  // Extract unique countries from locations (text after last comma)
  const allCountries = [...new Set(
    allLocations
      .map(loc => {
        const parts = loc.split(',').map(p => p.trim());
        return parts[parts.length - 1]; // Get last part (country)
      })
      .filter(Boolean)
  )];

  // Filter photos by selected filters (AND logic across types - OR within same types)
  const filteredPhotos = useMemo(() => photos.filter(photo => {
    if (selectedFilters.length === 0) return true;
  
    const tagFilters = selectedFilters.filter(f => f.type === 'tag');
    const locationFilters = selectedFilters.filter(f => f.type === 'location');
  
    const matchesTags =
      tagFilters.length === 0 ||
      tagFilters.some(filter =>
        photo.tags.some(tag =>
          tag.name.toLowerCase() === filter.value.toLowerCase()
        )
      );
  
    const matchesLocation =
      locationFilters.length === 0 ||
      locationFilters.some(filter =>
        photo.location &&
        photo.location.toLowerCase().includes(filter.value.toLowerCase())
      );
  
    return matchesTags && matchesLocation;
  }), [photos, selectedFilters]);

  // Sort filtered photos based on selected sort order.
  // Memoised so the order is stable between renders (the old inline
  // Math.random() sort re-shuffled on every render, so the lightbox could jump
  // to a different photo whenever any state changed).
  const sortedPhotos = useMemo(() => {
    if (sortOrder === 'random') {
      return filteredPhotos
        .map((photo) => ({ photo, key: Math.random() }))
        .sort((a, b) => a.key - b.key)
        .map(({ photo }) => photo);
    }
    return [...filteredPhotos].sort((a, b) => {
    switch (sortOrder) {
      case 'date-taken':
        // Sort by photo_date (newest first), fall back to created_at
        const dateA = a.photo_date ? new Date(a.photo_date) : new Date(a.created_at);
        const dateB = b.photo_date ? new Date(b.photo_date) : new Date(b.created_at);
        return dateB - dateA;
      
      case 'date-added':
        // Sort by created_at (when added to portfolio)
        return new Date(b.created_at) - new Date(a.created_at);
      
      case 'location':
        // Sort alphabetically by location
        const locA = a.location || 'zzz';
        const locB = b.location || 'zzz';
        return locA.localeCompare(locB);
      
      default:
        return 0;
    }
    });
  }, [filteredPhotos, sortOrder]);

  // Get matching suggestions based on search query
  const getSuggestions = () => {
    if (!searchQuery || searchQuery.length < 2) return [];
    
    const query = searchQuery.toLowerCase();
    const suggestions = [];
    
    // Add matching tags (exclude already selected)
    allTags.forEach(tag => {
      const alreadySelected = selectedFilters.some(f => 
        f.type === 'tag' && f.value.toLowerCase() === tag.name.toLowerCase()
      );
      
      if (!alreadySelected && tag.name.toLowerCase().includes(query)) {
        const count = photos.filter(p => 
          p.tags.some(t => t.id === tag.id)
        ).length;
        suggestions.push({
          type: 'tag',
          label: capitalize(tag.name),
          value: tag.name,
          count
        });
      }
    });
    
    // Add matching countries (exclude already selected)
    allCountries.forEach(country => {
      const alreadySelected = selectedFilters.some(f => 
        f.type === 'location' && f.value.toLowerCase() === country.toLowerCase()
      );
      
      if (!alreadySelected && country.toLowerCase().includes(query)) {
        // Count photos from this country
        const count = photos.filter(p => 
          p.location && p.location.toLowerCase().includes(country.toLowerCase())
        ).length;
        suggestions.push({
          type: 'location',
          label: country,
          value: country,
          count
        });
      }
    });
    
    // Add matching specific locations (cities) - only if no country matches yet
    allLocations.forEach(location => {
      const alreadySelected = selectedFilters.some(f => 
        f.type === 'location' && location.toLowerCase().includes(f.value.toLowerCase())
      );
      
      if (!alreadySelected && location.toLowerCase().includes(query)) {
        const count = photos.filter(p => 
          p.location && p.location.toLowerCase().includes(location.toLowerCase())
        ).length;
        
        // Only add if not already covered by country
        const isDuplicate = suggestions.some(s => 
          s.type === 'location' && location.includes(s.value)
        );
        
        if (!isDuplicate) {
          suggestions.push({
            type: 'location',
            label: location,
            value: location,
            count
          });
        }
      }
    });
    
    return suggestions.slice(0, 8); // Limit to 8 suggestions
  };

  const handleSearchSelect = (suggestion) => {
    // Add to selected filters
    setSelectedFilters(prev => [...prev, suggestion]);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const removeFilter = (index) => {
    setSelectedFilters(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFilters = () => {
    setSelectedFilters([]);
    setSearchQuery('');
  };

  // Auth handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    else setShowLogin(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Tag filtering
  // File handling
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    addFiles(files);
  };

  const addFiles = async (files) => {
    const filePromises = files.map(async (file) => {
      console.log(`File: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)}MB, Type: ${file.type}`);
      
      // Extract EXIF keywords
      const exifKeywords = await extractExifKeywords(file);
      
      return {
        file,
        preview: URL.createObjectURL(file),
        title: '',
        description: '',
        tags: exifKeywords, // Pre-fill with EXIF keywords if available
        uploaded: false
      };
    });
    
    const newFiles = await Promise.all(filePromises);
    setUploadFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index) => {
    setUploadFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const updateFileMetadata = (index, field, value) => {
    setUploadFiles(prev => {
      const newFiles = [...prev];
      newFiles[index][field] = value;
      return newFiles;
    });
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Upload handler
  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    
    setUploading(true);

    try {
    
    for (let i = 0; i < uploadFiles.length; i++) {
      const fileData = uploadFiles[i];
      if (fileData.uploaded) continue;
      
      try {
        // Compute file hash
        const fileHash = await computeFileHash(fileData.file);
        
        // Extract location from EXIF data
        const location = await extractLocation(fileData.file);
        console.log('Extracted location for', fileData.file.name, ':', location);
        
        // Extract photo taken date from EXIF data
        const photoDate = await extractPhotoDate(fileData.file);
        console.log('Extracted photo date for', fileData.file.name, ':', photoDate);
        
        // Check if photo with this hash already exists
        const { data: existingPhoto } = await supabase
          .from('photos')
          .select('id')
          .eq('file_hash', fileHash)
          .maybeSingle();
        
        if (existingPhoto) {
          alert(`Photo "${fileData.file.name}" already exists in the portfolio`);
          continue;
        }
        
        // Upload to Cloudinary
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        console.log('Uploading to Cloudinary:', {
          cloudName: CLOUDINARY_CLOUD_NAME,
          preset: CLOUDINARY_UPLOAD_PRESET,
          fileName: fileData.file.name
        });

        formData.append('quality', 'auto:best'); // Force best quality
        formData.append('resource_type', 'image');
        
        const cloudinaryResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          {
            method: 'POST',
            body: formData
          }
        );
        
        if (!cloudinaryResponse.ok) {
          throw new Error('Cloudinary upload failed');
        }
        
        const cloudinaryData = await cloudinaryResponse.json();
        
        // Save to Supabase with location and photo date
        const { data: photo, error } = await supabase
          .from('photos')
          .insert({
            cloudinary_url: cloudinaryData.secure_url,
            cloudinary_public_id: cloudinaryData.public_id,
            title: fileData.title || fileData.file.name,
            description: fileData.description,
            file_hash: fileHash,
            location: location,
            photo_date: photoDate,
            width: cloudinaryData.width,
            height: cloudinaryData.height
          })
          .select()
          .single();
        
        if (error) throw error;
        
        // Handle tags
        let allTags = fileData.tags;
        
        const tagNames = allTags.split(',').map(t => t.trim()).filter(Boolean);
        for (const tagName of tagNames) {
          const { data: existingTag } = await supabase
            .from('tags')
            .select('id')
            .eq('name', tagName)
            .maybeSingle();
          
          let tagId;
          if (existingTag) {
            tagId = existingTag.id;
          } else {
            const { data: newTag } = await supabase
              .from('tags')
              .insert({ name: tagName })
              .select()
              .single();
            tagId = newTag.id;
          }
          
          await supabase
            .from('photo_tags')
            .insert({
              photo_id: photo.id,
              tag_id: tagId
            });
        }
        
        // Mark as uploaded
        updateFileMetadata(i, 'uploaded', true);
        
      } catch (error) {
        alert(`Upload failed for ${fileData.file.name}: ${error.message}`);
        console.error(error);
      }
    }
    } finally {
      setUploading(false);
    }
    
    fetchPhotos();
    
    // Clear uploaded files
    setTimeout(() => {
      setUploadFiles(prev => prev.filter(f => !f.uploaded));
    }, 1000);
  };

  // Delete photo
  const handleDelete = async (photo) => {
    if (!window.confirm('Delete this photo?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert('You must be logged in to delete photos');
        return;
      }

      // Detect platform and use correct endpoint
      const apiEndpoint = window.location.hostname.includes('netlify.app') 
        ? '/.netlify/functions/delete-photo'
        : '/api/delete-photo';

      const response = await fetch(apiEndpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          id: photo.id,
          cloudinary_public_id: photo.cloudinary_public_id
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Delete failed');
      }

      console.log('Photo deleted successfully:', result);
      fetchPhotos();
    } catch (error) {
      alert('Delete failed: ' + error.message);
      console.error('Delete error:', error);
    }
  };

  // Edit photo
  const handleEdit = async () => {
    if (!editingPhoto) return;

    try {
      await supabase
        .from('photos')
        .update({
          title: editingPhoto.title,
          description: editingPhoto.description
        })
        .eq('id', editingPhoto.id);

      await supabase.from('photo_tags').delete().eq('photo_id', editingPhoto.id);

      const tagNames = editingPhoto.tags.split(',').map(t => t.trim()).filter(Boolean);
      for (const tagName of tagNames) {
        const { data: existingTag } = await supabase
          .from('tags')
          .select('id')
          .eq('name', tagName)
          .maybeSingle();

        let tagId;
        if (existingTag) {
          tagId = existingTag.id;
        } else {
          const { data: newTag } = await supabase
            .from('tags')
            .insert({ name: tagName })
            .select()
            .single();
          tagId = newTag.id;
        }

        await supabase
          .from('photo_tags')
          .insert({
            photo_id: editingPhoto.id,
            tag_id: tagId
          });
      }

      setEditingPhoto(null);
      fetchPhotos();
    } catch (error) {
      alert('Update failed: ' + error.message);
    }
  };
  
  // Lightbox navigation
  const openLightbox = (index) => {
    setCurrentPhotoIndex(index);
    setShowLightbox(true);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log('Fullscreen request failed:', err);
      });
    }
  };

  const nextPhoto = useCallback(() => {
    setCurrentPhotoIndex((prev) => (prev + 1) % filteredPhotos.length);
  }, [filteredPhotos.length]);

  const prevPhoto = useCallback(() => {
    setCurrentPhotoIndex((prev) => (prev - 1 + filteredPhotos.length) % filteredPhotos.length);
  }, [filteredPhotos.length]);

  const closeLightbox = useCallback(() => {
    setShowLightbox(false);
    
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }, []);

  // The photo currently shown in the lightbox, and whether its full-size image
  // has arrived. Derived from the photo id, so navigating never needs a reset
  // (and an image we already have shows instantly).
  const currentPhoto = sortedPhotos[currentPhotoIndex];
  const imageLoaded = !!currentPhoto && loadedId === currentPhoto.id;

  // An image served from cache is already "complete" when it mounts. Checking in a
  // layout effect (before the first paint) means it appears instantly at full
  // opacity; only images that really have to download get the fade-in.
  useLayoutEffect(() => {
    const el = fullImgRef.current;
    if (showLightbox && el && el.complete && el.naturalWidth > 0 && currentPhoto) {
      setLoadedId(currentPhoto.id);
    }
  }, [showLightbox, currentPhoto]);

  // Prefetch neighbours - but only once the current image has finished, so we
  // never compete with it for bandwidth. +/-1 right away, +/-2 when idle.
  useEffect(() => {
    if (!showLightbox || !imageLoaded || sortedPhotos.length < 2) return;
    // Respect Data Saver / very slow connections: don't spend their data on photos they may never open.
    const conn = navigator.connection;
    if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return;
    const at = (offset) =>
      sortedPhotos[(currentPhotoIndex + offset + sortedPhotos.length) % sortedPhotos.length];

    [1, -1].forEach((o) => prefetchImage(getFullUrl(at(o).cloudinary_url)));

    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
    const cancelIdle = window.cancelIdleCallback || clearTimeout;
    const handle = idle(() => {
      [2, -2].forEach((o) => prefetchImage(getFullUrl(at(o).cloudinary_url)));
    });
    return () => cancelIdle(handle);
  }, [showLightbox, imageLoaded, currentPhotoIndex, sortedPhotos]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showLightbox) return;
      if (e.key === 'ArrowRight') nextPhoto();
      if (e.key === 'ArrowLeft') prevPhoto();
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLightbox, nextPhoto, prevPhoto, closeLightbox]);

  return (
    <div>
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1 className="site-title">ATELIER</h1>
          
          <div className="header-actions">
            {user && (
              <button className="btn-primary" onClick={() => setShowUpload(true)}>
                Upload
              </button>
            )}
            
            {user ? (
              <button className="btn-secondary" onClick={handleLogout}>
                Logout
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => setShowLogin(true)}>
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="search-bar">
        <div className="search-container">
          {/* Selected Filters as Chips */}
          {selectedFilters.length > 0 && (
            <div className="filter-chips">
              {selectedFilters.map((filter, index) => (
                <div key={index} className="filter-chip">
                  <span className="chip-icon">
                    {filter.type === 'tag' ? '🏷️' : '📍'}
                  </span>
                  <span className="chip-label">{filter.label}</span>
                  <button 
                    className="chip-remove"
                    onClick={() => removeFilter(index)}
                    aria-label="Remove filter"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button 
                className="clear-all-btn"
                onClick={clearAllFilters}
              >
                Clear all
              </button>
            </div>
          )}
          
          {/* Search Input + Sort Dropdown on Same Row */}
          <div className="search-and-sort-row">
            <div className="search-input-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder={selectedFilters.length > 0 ? "Add another category or location..." : "Search by category or location..."}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    setShowSuggestions(false);
                  }
                }}
              />
              {searchQuery && (
                <button 
                  className="search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search input"
                >
                  ×
                </button>
              )}
            </div>
            
            {/* Sort Dropdown */}
            <div className="sort-dropdown">
              <label htmlFor="sort-select" className="sort-label">Sort:</label>
              <select
                id="sort-select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="sort-select"
              >
                <option value="date-taken">Date Taken</option>
                <option value="date-added">Date Added</option>
                <option value="location">Location</option>
                <option value="random">Random</option>
              </select>
            </div>
          </div>
          
          {/* Suggestions Dropdown */}
          {showSuggestions && getSuggestions().length > 0 && (
            <div className="search-suggestions">
              {getSuggestions().map((suggestion, index) => (
                <div
                  key={index}
                  className="suggestion-item"
                  onClick={() => handleSearchSelect(suggestion)}
                >
                  <span className="suggestion-icon">
                    {suggestion.type === 'tag' ? '🏷️' : '📍'}
                  </span>
                  <span className="suggestion-label">{suggestion.label}</span>
                  <span className="suggestion-count">({suggestion.count})</span>
                </div>
              ))}
            </div>
          )}
          
          {selectedFilters.length > 0 && (
            <div className="search-results-info">
              Showing {sortedPhotos.length} of {photos.length} photos
            </div>
          )}
        </div>
      </div>

      {/* Gallery */}
      <div className="gallery-container">
        {loading ? (
          <div className="gallery-loading">
            Loading photos...
          </div>
        ) : (
          <div className="gallery-grid">
            {sortedPhotos.map((photo, index) => (
              <div
                key={photo.id}
                className="photo-card"
                onClick={() => openLightbox(index)}
                // Reserve the card's space until its image arrives, so lazy images
                // below the fold don't all collapse to 0px and load at once.
                style={photo.width && photo.height ? { '--ar': `${photo.width} / ${photo.height}` } : undefined}
              >
                <ThumbImg photo={photo} index={index} />
                
                {/* Thumbnail overlay with location and description */}
                {(photo.location || photo.description) && (
                  <div className="photo-overlay">
                    {photo.location && (
                      <p className="photo-location">📍 {photo.location}</p>
                    )}
                    {photo.description && (
                      <p className="photo-description">{photo.description}</p>
                    )}
                  </div>
                )}
                
                {user && (
                  <div className="admin-controls">
                    <button 
                      className="admin-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPhoto({
                          ...photo,
                          tags: photo.tags.map(t => t.name).join(', ')
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button 
                      className="admin-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(photo);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Login Modal */}
      {showLogin && (
        <div className="modal-overlay" onClick={() => setShowLogin(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Admin Login</h2>
            <form onSubmit={handleLogin} className="login-form">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary">
                Login
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Upload Photos</h2>
            
            <div
              className={`dropzone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <p className="dropzone-text">Drag & drop photos here</p>
              <p className="dropzone-subtext">or</p>
              <label className="btn-primary" style={{ display: 'inline-block', cursor: 'pointer' }}>
                Choose Files
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {uploadFiles.length > 0 && (
              <div className="file-list">
                {uploadFiles.map((fileData, index) => (
                  <div key={index} className={`file-upload-item ${fileData.uploaded ? 'uploaded' : ''}`}>
                    <img src={fileData.preview} alt="Preview" className="file-preview" />
                    <div className="file-metadata">
                      <div className="file-header">
                        <strong>{fileData.file.name}</strong>
                        {fileData.uploaded ? (
                          <span className="upload-success">✓</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="remove-btn"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Title"
                        value={fileData.title}
                        onChange={(e) => updateFileMetadata(index, 'title', e.target.value)}
                        disabled={fileData.uploaded}
                      />
                      <textarea
                        placeholder="Description"
                        value={fileData.description}
                        onChange={(e) => updateFileMetadata(index, 'description', e.target.value)}
                        rows={2}
                        disabled={fileData.uploaded}
                      />
                      <input
                        type="text"
                        placeholder="Tags (comma-separated)"
                        value={fileData.tags}
                        onChange={(e) => updateFileMetadata(index, 'tags', e.target.value)}
                        disabled={fileData.uploaded}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button
                onClick={handleUpload}
                disabled={uploadFiles.length === 0 || uploading}
                className={`btn-primary ${(uploadFiles.length === 0 || uploading) ? 'btn-disabled' : ''}`}
              >
                {uploading ? 'Uploading...' : 'Upload All'}
              </button>
              <button onClick={() => setShowUpload(false)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingPhoto && (
        <div className="modal-overlay" onClick={() => setEditingPhoto(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Edit Photo</h2>
            <div className="edit-form">
              <input
                type="text"
                placeholder="Title"
                value={editingPhoto.title}
                onChange={(e) => setEditingPhoto({...editingPhoto, title: e.target.value})}
              />
              <textarea
                placeholder="Description"
                value={editingPhoto.description}
                onChange={(e) => setEditingPhoto({...editingPhoto, description: e.target.value})}
                rows={4}
              />
              <input
                type="text"
                placeholder="Tags (comma-separated)"
                value={editingPhoto.tags}
                onChange={(e) => setEditingPhoto({...editingPhoto, tags: e.target.value})}
              />
              <button onClick={handleEdit} className="btn-primary">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {showLightbox && sortedPhotos[currentPhotoIndex] && (
        <div 
          className="modal-overlay lightbox"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel} // This captures MacBook trackpad swipes
        >
          <button className="lightbox-close" onClick={closeLightbox}>×</button>
          <button className="lightbox-nav prev" onClick={prevPhoto}>‹</button>
          <button className="lightbox-nav next" onClick={nextPhoto}>›</button>

          
          
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            {/* The "Base" Thumbnail - the exact file the grid already loaded, so it's an instant cache hit */}
            <img
              src={getCachedThumb(sortedPhotos[currentPhotoIndex])}
              className="lightbox-image-placeholder"
              alt=""
              aria-hidden="true"
            />

            {/* The Full Image - Fades in over the placeholder */}
            <img
              key={sortedPhotos[currentPhotoIndex].id}
              ref={fullImgRef}
              src={getFullUrl(sortedPhotos[currentPhotoIndex].cloudinary_url)}
              className="lightbox-image"
              decoding="async"
              onLoad={() => setLoadedId(sortedPhotos[currentPhotoIndex].id)}
              style={{
                opacity: imageLoaded ? 1 : 0
              }}
              alt={sortedPhotos[currentPhotoIndex].title || sortedPhotos[currentPhotoIndex].description || 'Portfolio photo'}
            />
            
            {/* Only show info when image is loaded */}
            {imageLoaded && (
              <div className="lightbox-info">
                {/* {sortedPhotos[currentPhotoIndex].title && (
                  <h3 className="lightbox-title">{sortedPhotos[currentPhotoIndex].title}</h3>
                )} */}
                {sortedPhotos[currentPhotoIndex].description && (
                  <p className="lightbox-description">{sortedPhotos[currentPhotoIndex].description}</p>
                )}
                {sortedPhotos[currentPhotoIndex].location && (
                  <p className="lightbox-location">📍 {sortedPhotos[currentPhotoIndex].location}</p>
                )}
                {sortedPhotos[currentPhotoIndex].tags.length > 0 && (
                  <div className="lightbox-tags">
                    {sortedPhotos[currentPhotoIndex].tags.map(tag => (
                      <span key={tag.id} className="lightbox-tag">{capitalize(tag.name)}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <footer>
        &copy; {year} <a href="mailto:stff1@hotmail.com">stff1@hotmail.com</a>
      </footer>
    </div>
  );
};

export default PhotoPortfolio;