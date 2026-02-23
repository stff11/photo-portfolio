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

// Helper to capitalize first letter
const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

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
  const [uploadFiles, setUploadFiles] = useState([]);
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

  // Get photo count for each tag
  const getTagCount = (tag) => {
    if (!tag) return photos.length; // "All" count
    return photos.filter(photo => 
      photo.tags.some(t => t.id === tag.id)
    ).length;
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
  const toggleTag = (tag) => {
    setSelectedTags(prev => {
      const isSelected = prev.some(t => t.id === tag.id);
      if (isSelected) {
        return prev.filter(t => t.id !== tag.id);
      } else {
        return [...prev, tag];
      }
    });
  };

  const clearTags = () => {
    setSelectedTags([]);
  };

  // File handling
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    addFiles(files);
  };

  const addFiles = (files) => {
    const newFiles = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      title: '',
      description: '',
      tags: '',
      uploaded: false
    }));
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
        
        // Save to Supabase
        const { data: photo, error } = await supabase
          .from('photos')
          .insert({
            cloudinary_url: cloudinaryData.secure_url,
            cloudinary_public_id: cloudinaryData.public_id,
            title: fileData.title || fileData.file.name,
            description: fileData.description,
            file_hash: fileHash
          })
          .select()
          .single();
        
        if (error) throw error;
        
        // Handle tags
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
    console.log('getThumbUrl input:', url);
    if (!url) {
      console.log('URL is null/undefined');
      return '';
    }
    if (url.includes('/upload/')) {
      const result = url.replace('/upload/', '/upload/w_600,h_600,c_fill,f_auto,q_auto/');
      console.log('getThumbUrl output:', result);
      return result;
    }
    console.log('URL does not contain /upload/, returning original:', url);
    return url;
  };

  const getFullUrl = (url) => {
    if (!url) return '';
    if (url.includes('/upload/')) {
      return url.replace('/upload/', '/upload/w_2000,f_auto,q_auto/');
    }
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

      {/* Tag Filter Bar */}
      {allTags.length > 0 && (
        <div className="tag-filter">
          <div className="tag-filter-content">
            <button
              className={`tag-button ${selectedTags.length === 0 ? 'selected' : ''}`}
              onClick={clearTags}
            >
              All ({getTagCount()})
            </button>
            {allTags.map(tag => (
              <button
                key={tag.id}
                className={`tag-button ${selectedTags.some(t => t.id === tag.id) ? 'selected' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {capitalize(tag.name)} ({getTagCount(tag)})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gallery */}
      <div className="gallery-container">
        <div className="gallery-grid">
          {filteredPhotos.map((photo, index) => (
            <div key={photo.id} className="photo-card" onClick={() => openLightbox(index)}>
              <img 
                src={getThumbUrl(photo.cloudinary_url)} 
                alt={photo.title || 'Portfolio photo'} 
              />
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
      {showLightbox && filteredPhotos[currentPhotoIndex] && (
        <div className="modal-overlay lightbox">
          <button className="lightbox-close" onClick={closeLightbox}>×</button>
          <button className="lightbox-nav prev" onClick={prevPhoto}>‹</button>
          <button className="lightbox-nav next" onClick={nextPhoto}>›</button>
          
          <div className="lightbox-content">
            <img
              src={getFullUrl(filteredPhotos[currentPhotoIndex].cloudinary_url)}
              alt={filteredPhotos[currentPhotoIndex].title}
              className="lightbox-image"
            />
            
            <div className="lightbox-info">
              {/* {filteredPhotos[currentPhotoIndex].title && (
                <h3 className="lightbox-title">{filteredPhotos[currentPhotoIndex].title}</h3>
              )} */}
              {filteredPhotos[currentPhotoIndex].description && (
                <p className="lightbox-description">{filteredPhotos[currentPhotoIndex].description}</p>
              )}
              {filteredPhotos[currentPhotoIndex].tags.length > 0 && (
                <div className="lightbox-tags">
                  {filteredPhotos[currentPhotoIndex].tags.map(tag => (
                    <span key={tag.id} className="lightbox-tag">{capitalize(tag.name)}</span>
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