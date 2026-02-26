import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import exifr from 'exifr';
import './photo-portfolio.css';

// Initialize Supabase client
const supabase = createClient(
  'https://ygftopwtblcoxgzusywy.supabase.co',
  'sb_publishable_dROTCxmlboYY-oj5UjwmPQ_KbP0MdlS'
);

// Cloudinary config
const CLOUDINARY_CLOUD_NAME = 'dgsr2qkwp';
const CLOUDINARY_UPLOAD_PRESET = 'portfolio_preset';

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
    const exifData = await exifr.parse(file, { gps: true });
    
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
    const exifData = await exifr.parse(file, { 
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
    const exifData = await exifr.parse(file, { 
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

const PhotoPortfolio = () => {
  const [photos, setPhotos] = useState([]);
  const [allTags, setAllTags] = useState([]);
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
  const [useAITags, setUseAITags] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState([]); // Array of {type, value, label}
  const [sortOrder, setSortOrder] = useState('date-taken'); // 'date-taken', 'date-added', 'random', 'location'

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
      
      // Extract unique tags
      const tagSet = new Set();
      processedPhotos.forEach(p => p.tags.forEach(t => tagSet.add(JSON.stringify(t))));
      setAllTags(Array.from(tagSet).map(t => JSON.parse(t)));
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

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

  // Filter photos by selected filters (AND logic - must match all selected filters)
  const filteredPhotos = photos.filter(photo => {
    if (selectedFilters.length === 0) return true;
    
    return selectedFilters.every(filter => {
      if (filter.type === 'tag') {
        // Check if photo has this tag (exact match)
        return photo.tags.some(tag => 
          tag.name.toLowerCase() === filter.value.toLowerCase()
        );
      } else if (filter.type === 'location') {
        // Check if photo location contains this text (partial match)
        return photo.location && 
          photo.location.toLowerCase().includes(filter.value.toLowerCase());
      }
      return false;
    });
  });

  // Sort filtered photos based on selected sort order
  const sortedPhotos = [...filteredPhotos].sort((a, b) => {
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
      
      case 'random':
        // Random sort (using a consistent seed based on photo IDs)
        return Math.random() - 0.5;
      
      default:
        return 0;
    }
  });

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
            photo_date: photoDate
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
    
    setUploading(false);
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
    setImageLoaded(false);
    
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log('Fullscreen request failed:', err);
      });
    }
  };

  const nextPhoto = useCallback(() => {
    setImageLoaded(false);
    setCurrentPhotoIndex((prev) => (prev + 1) % filteredPhotos.length);
  }, [filteredPhotos.length]);

  const prevPhoto = useCallback(() => {
    setImageLoaded(false);
    setCurrentPhotoIndex((prev) => (prev - 1 + filteredPhotos.length) % filteredPhotos.length);
  }, [filteredPhotos.length]);

  const closeLightbox = useCallback(() => {
    setShowLightbox(false);
    
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }, []);

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

  // Cloudinary URL builders
  const getThumbUrl = (url) => {
    if (!url) return '';
    if (url.includes('/upload/')) {
      // Higher quality thumbnails
      return url.replace('/upload/', '/upload/w_800,h_800,c_limit,q_90,f_auto/');
    }
    return url;
  };

  const getFullUrl = (url) => {
    if (!url) return '';
    // Return original quality for fullscreen - no transformations
    return url;
  };

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
                Admin Login
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
        <div className="gallery-grid">
          {sortedPhotos.map((photo, index) => (
            <div key={photo.id} className="photo-card" onClick={() => openLightbox(index)}>
              <img 
                src={getThumbUrl(photo.cloudinary_url)} 
                alt={photo.title || 'Portfolio photo'} 
              />
              
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

            {/* <div className="ai-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={useAITags}
                  onChange={(e) => setUseAITags(e.target.checked)}
                />
                <span>Generate additional tags using AI (requires API key)</span>
              </label>
              {useAITags && !process.env.REACT_APP_ANTHROPIC_API_KEY && (
                <p className="ai-warning">⚠️ Set REACT_APP_ANTHROPIC_API_KEY environment variable to use AI tagging</p>
              )}
            </div> */}

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
        <div className="modal-overlay lightbox">
          <button className="lightbox-close" onClick={closeLightbox}>×</button>
          <button className="lightbox-nav prev" onClick={prevPhoto}>‹</button>
          <button className="lightbox-nav next" onClick={nextPhoto}>›</button>
          
          <div className="lightbox-content">
            <img
              src={getFullUrl(sortedPhotos[currentPhotoIndex].cloudinary_url)}
              alt={sortedPhotos[currentPhotoIndex].title}
              className="lightbox-image"
              onLoad={() => setImageLoaded(true)}
              style={{ opacity: imageLoaded ? 1 : 0.3, transition: 'opacity 0.3s ease' }}
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
    </div>
  );
};

export default PhotoPortfolio;