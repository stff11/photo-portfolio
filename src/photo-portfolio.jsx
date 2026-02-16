import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
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

const PhotoPortfolio = () => {
  const [photos, setPhotos] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [uploadFiles, setUploadFiles] = useState([]); // Array of files with metadata
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
      // Process photos to include tags array and remove duplicates
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

  // Filter photos by selected tags
  const filteredPhotos = selectedTags.length > 0
    ? photos.filter(photo => 
        selectedTags.every(selectedTag => 
          photo.tags.some(tag => tag.id === selectedTag.id)
        )
      )
    : photos;

  // Auth handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      setShowLogin(false);
      setEmail('');
      setPassword('');
    } else {
      alert('Login failed: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Tag filtering
  const toggleTag = (tag) => {
    setSelectedTags(prev => {
      const exists = prev.find(t => t.id === tag.id);
      if (exists) {
        return prev.filter(t => t.id !== tag.id);
      } else {
        return [...prev, tag];
      }
    });
  };

  // Upload handlers
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    addFilesToUpload(files);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files || []).filter(file => 
      file.type.startsWith('image/')
    );
    addFilesToUpload(files);
  };

  const addFilesToUpload = async (files) => {
    const newFiles = await Promise.all(files.map(async (file) => ({
      file,
      preview: URL.createObjectURL(file),
      title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      description: '',
      tags: '',
      uploaded: false,
      fileHash: await computeFileHash(file) // Compute content hash
    })));
    setUploadFiles(prev => [...prev, ...newFiles]);
    setShowUpload(true);
  };

  const updateFileMetadata = (index, field, value) => {
    setUploadFiles(prev => prev.map((f, i) => 
      i === index ? { ...f, [field]: value } : f
    ));
  };

  const removeFile = (index) => {
    setUploadFiles(prev => {
      const file = prev[index];
      URL.revokeObjectURL(file.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleBulkUpload = async () => {
    setUploading(true);
    
    for (let i = 0; i < uploadFiles.length; i++) {
      const fileData = uploadFiles[i];
      if (fileData.uploaded) continue;

      try {
        console.log('File hash:', fileData.fileHash);
        
        // Check if this file hash already exists in our database (BEFORE uploading to Cloudinary)
        const { data: existingPhoto, error: checkError } = await supabase
          .from('photos')
          .select('id, title, file_hash')
          .eq('file_hash', fileData.fileHash)
          .maybeSingle();
        
        console.log('Existing photo check:', existingPhoto);
        
        if (checkError) {
          console.error('Error checking for duplicates:', checkError);
        }
        
        if (existingPhoto) {
          // Photo already exists - skip it
          console.log(`Duplicate detected: ${fileData.title} matches ${existingPhoto.title}`);
          setUploadFiles(prev => prev.map((f, idx) => 
            idx === i ? { ...f, uploaded: true, duplicate: true, duplicateTitle: existingPhoto.title } : f
          ));
          alert(`"${fileData.title}" is a duplicate of "${existingPhoto.title}" - skipped`);
          continue;
        }
        
        console.log('No duplicate found, uploading to Cloudinary...');
        
        // Upload to Cloudinary
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        
        const cloudinaryRes = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: formData }
        );
        
        const cloudinaryData = await cloudinaryRes.json();
        
        console.log('Cloudinary upload complete:', cloudinaryData.public_id);
        
        // Save to Supabase
        const { data: photoData, error: photoError } = await supabase
          .from('photos')
          .insert({
            cloudinary_url: cloudinaryData.secure_url,
            cloudinary_public_id: cloudinaryData.public_id,
            file_hash: fileData.fileHash,
            title: fileData.title,
            description: fileData.description,
            width: cloudinaryData.width,
            height: cloudinaryData.height
          })
          .select()
          .single();

        if (photoError) throw photoError;

        // Handle tags if provided
        if (fileData.tags.trim()) {
          const tagNames = fileData.tags.split(',').map(t => t.trim()).filter(Boolean);
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
                photo_id: photoData.id,
                tag_id: tagId
              });
          }
        }

        // Mark as uploaded
        setUploadFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, uploaded: true } : f
        ));
      } catch (error) {
        alert(`Upload failed for ${fileData.title}: ${error.message}`);
      }
    }

    setUploading(false);
    setShowUpload(false);
    setUploadFiles([]);
    fetchPhotos();
  };

  // Delete photo
  const handleDelete = async (photo) => {
    if (!window.confirm('Delete this photo?')) return;

    try {
      // Get the user's session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert('You must be logged in to delete photos');
        return;
      }

      // Call backend API to delete from both Cloudinary and Supabase
      const response = await fetch('/api/delete-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          photoId: photo.id,
          publicId: photo.cloudinary_public_id
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
      // Update photo metadata
      await supabase
        .from('photos')
        .update({
          title: editingPhoto.title,
          description: editingPhoto.description
        })
        .eq('id', editingPhoto.id);

      // Update tags
      // First, delete existing tags
      await supabase.from('photo_tags').delete().eq('photo_id', editingPhoto.id);

      // Then add new tags
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
    
    // Request fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log('Fullscreen request failed:', err);
      });
    }
  };

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % filteredPhotos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + filteredPhotos.length) % filteredPhotos.length);
  };

  const closeLightbox = () => {
    setShowLightbox(false);
    
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  };

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
  }, [showLightbox, currentPhotoIndex, filteredPhotos.length]);

  // Cloudinary URL builders
  const getThumbUrl = (url) => {
    return url.replace('/upload/', '/upload/w_600,h_600,c_fill,f_auto,q_auto/');
  };

  const getFullUrl = (url) => {
    return url.replace('/upload/', '/upload/w_2000,f_auto,q_auto/');
  };

  return (
    <div>
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1 className="site-title">ATELIER</h1>
          
          <div className="header-actions">
            {user && (
              <button
                onClick={() => setShowUpload(true)}
                className="btn-primary"
              >
                + UPLOAD
              </button>
            )}
            
            {user ? (
              <button
                onClick={handleLogout}
                className="btn-secondary"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="btn-secondary"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Tag Filter Bar */}
      {allTags.length > 0 && (
        <div className="tag-filter">
          <div className="tag-filter-content">
            <button
              onClick={() => setSelectedTags([])}
              className={`tag-button ${selectedTags.length === 0 ? 'selected' : ''}`}
            >
              All
            </button>
            {allTags.map(tag => {
              const isSelected = selectedTags.some(t => t.id === tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag)}
                  className={`tag-button ${isSelected ? 'selected' : ''}`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Masonry Gallery */}
      <main className="gallery-container">
        <div className="gallery-grid">
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.id}
              className="photo-card"
              onClick={() => openLightbox(index)}
            >
              <img
                src={getThumbUrl(photo.cloudinary_url)}
                alt={photo.title}
                loading="lazy"
              />
              
              {user && (
                <div className="admin-controls" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setEditingPhoto({
                      ...photo,
                      tags: photo.tags.map(t => t.name).join(', ')
                    })}
                    className="admin-btn"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(photo)}
                    className="admin-btn"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Login Modal */}
      {showLogin && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            backdropFilter: 'blur(5px)'
          }}
          onClick={() => setShowLogin(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '3rem',
              borderRadius: '2px',
              maxWidth: '400px',
              width: '90%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '1.5rem',
              marginBottom: '2rem',
              fontWeight: 300,
              letterSpacing: '0.05em',
              color: '#000000'
            }}>
              Admin Login
            </h2>
            
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '2px',
                  fontFamily: 'inherit',
                  fontSize: '1rem'
                }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '2px',
                  fontFamily: 'inherit',
                  fontSize: '1rem'
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '0.75rem',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '1rem',
                  letterSpacing: '0.05em'
                }}
              >
                Login
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            backdropFilter: 'blur(5px)',
            overflowY: 'auto',
            padding: '2rem'
          }}
          onClick={() => {
            if (!uploading) {
              setShowUpload(false);
              uploadFiles.forEach(f => URL.revokeObjectURL(f.preview));
              setUploadFiles([]);
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '3rem',
              borderRadius: '2px',
              maxWidth: '900px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '1.5rem',
              marginBottom: '2rem',
              fontWeight: 300,
              letterSpacing: '0.05em',
              color: '#000000'
            }}>
              Upload Photos
            </h2>
            
            {/* Drag & Drop Zone */}
            {uploadFiles.length === 0 && (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragActive ? '#1a1a1a' : '#ddd'}`,
                  borderRadius: '4px',
                  padding: '3rem',
                  textAlign: 'center',
                  backgroundColor: dragActive ? 'rgba(0,0,0,0.02)' : 'transparent',
                  transition: 'all 0.2s ease',
                  marginBottom: '1.5rem'
                }}
              >
                <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '1rem' }}>
                  Drag & drop images here
                </p>
                <p style={{ fontSize: '0.9rem', color: '#999', marginBottom: '1.5rem' }}>
                  or
                </p>
                <label style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.875rem',
                  letterSpacing: '0.05em',
                  display: 'inline-block'
                }}>
                  Browse Files
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}
            
            {/* File List */}
            {uploadFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {uploadFiles.map((fileData, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '150px 1fr',
                      gap: '1rem',
                      padding: '1rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: fileData.uploaded ? '#f0f9f0' : 'white'
                    }}
                  >
                    <img
                      src={fileData.preview}
                      alt={fileData.title}
                      style={{
                        width: '150px',
                        height: '150px',
                        objectFit: 'cover',
                        borderRadius: '2px'
                      }}
                    />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Title"
                          value={fileData.title}
                          onChange={(e) => updateFileMetadata(index, 'title', e.target.value)}
                          disabled={fileData.uploaded}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            border: '1px solid #ddd',
                            borderRadius: '2px',
                            fontFamily: 'inherit',
                            fontSize: '0.95rem',
                            backgroundColor: fileData.uploaded ? '#f5f5f5' : 'white'
                          }}
                        />
                        {!fileData.uploaded && (
                          <button
                            onClick={() => removeFile(index)}
                            style={{
                              marginLeft: '0.5rem',
                              padding: '0.5rem',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '1.2rem',
                              color: '#999'
                            }}
                          >
                            ✕
                          </button>
                        )}
                        {fileData.uploaded && (
                          <span style={{ marginLeft: '0.5rem', color: '#4caf50', fontSize: '1.2rem' }}>
                            ✓
                          </span>
                        )}
                      </div>
                      
                      <textarea
                        placeholder="Description (optional)"
                        value={fileData.description}
                        onChange={(e) => updateFileMetadata(index, 'description', e.target.value)}
                        disabled={fileData.uploaded}
                        rows={2}
                        style={{
                          padding: '0.5rem',
                          border: '1px solid #ddd',
                          borderRadius: '2px',
                          fontFamily: 'inherit',
                          fontSize: '0.9rem',
                          resize: 'vertical',
                          backgroundColor: fileData.uploaded ? '#f5f5f5' : 'white'
                        }}
                      />
                      
                      <input
                        type="text"
                        placeholder="Tags (comma-separated, optional)"
                        value={fileData.tags}
                        onChange={(e) => updateFileMetadata(index, 'tags', e.target.value)}
                        disabled={fileData.uploaded}
                        style={{
                          padding: '0.5rem',
                          border: '1px solid #ddd',
                          borderRadius: '2px',
                          fontFamily: 'inherit',
                          fontSize: '0.9rem',
                          backgroundColor: fileData.uploaded ? '#f5f5f5' : 'white'
                        }}
                      />
                    </div>
                  </div>
                ))}
                
                {/* Add More Button */}
                {!uploading && (
                  <label style={{
                    padding: '0.75rem',
                    backgroundColor: 'white',
                    border: '2px dashed #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    color: '#666',
                    fontSize: '0.9rem',
                    display: 'block'
                  }}>
                    + Add More Photos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
                
                {/* Upload Button */}
                <button
                  onClick={handleBulkUpload}
                  disabled={uploading || uploadFiles.every(f => f.uploaded)}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: (uploading || uploadFiles.every(f => f.uploaded)) ? '#ccc' : '#000000',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '2px',
                    cursor: (uploading || uploadFiles.every(f => f.uploaded)) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '1rem',
                    letterSpacing: '0.05em'
                  }}
                >
                  {uploading ? `Uploading... (${uploadFiles.filter(f => f.uploaded).length}/${uploadFiles.length})` : 
                   uploadFiles.every(f => f.uploaded) ? 'All Uploaded!' : 
                   `Upload ${uploadFiles.length} Photo${uploadFiles.length > 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingPhoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            backdropFilter: 'blur(5px)'
          }}
          onClick={() => setEditingPhoto(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '3rem',
              borderRadius: '2px',
              maxWidth: '600px',
              width: '90%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '1.5rem',
              marginBottom: '2rem',
              fontWeight: 300,
              letterSpacing: '0.05em',
              color: '#000000'
            }}>
              Edit Photo
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <input
                type="text"
                placeholder="Title"
                value={editingPhoto.title}
                onChange={(e) => setEditingPhoto(prev => ({ ...prev, title: e.target.value }))}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '2px',
                  fontFamily: 'inherit',
                  fontSize: '1rem'
                }}
              />
              
              <textarea
                placeholder="Description"
                value={editingPhoto.description}
                onChange={(e) => setEditingPhoto(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '2px',
                  fontFamily: 'inherit',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />
              
              <input
                type="text"
                placeholder="Tags (comma-separated)"
                value={editingPhoto.tags}
                onChange={(e) => setEditingPhoto(prev => ({ ...prev, tags: e.target.value }))}
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '2px',
                  fontFamily: 'inherit',
                  fontSize: '1rem'
                }}
              />
              
              <button
                onClick={handleEdit}
                style={{
                  padding: '0.75rem',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '1rem',
                  letterSpacing: '0.05em'
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox/Slideshow */}
      {showLightbox && filteredPhotos[currentPhotoIndex] && (
        <div
          className="modal-overlay lightbox"
          onClick={closeLightbox}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevPhoto();
            }}
            className="lightbox-nav prev"
          >
            ←
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextPhoto();
            }}
            className="lightbox-nav next"
          >
            →
          </button>
          
          <button
            onClick={closeLightbox}
            className="lightbox-close"
          >
            ✕
          </button>
          
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img
              src={getFullUrl(filteredPhotos[currentPhotoIndex].cloudinary_url)}
              alt={filteredPhotos[currentPhotoIndex].title}
              className="lightbox-image"
            />
            
            <div className="lightbox-info">
              <h3 className="lightbox-title">
                {filteredPhotos[currentPhotoIndex].title}
              </h3>
              
              {filteredPhotos[currentPhotoIndex].description && (
                <p className="lightbox-description">
                  {filteredPhotos[currentPhotoIndex].description}
                </p>
              )}
              
              {filteredPhotos[currentPhotoIndex].tags.length > 0 && (
                <div className="lightbox-tags">
                  {filteredPhotos[currentPhotoIndex].tags.map(tag => (
                    <span key={tag.id} className="lightbox-tag">
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoPortfolio;