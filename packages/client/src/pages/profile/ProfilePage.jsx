/**
 * Profile Page - view and edit user profile with avatar upload.
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../api/client';
import { Card, Button, Input, Spinner } from '../../components/common';
import { Camera, UserIcon, LogOut } from '../../components/Icons';
import '../dashboard/dashboard.css';
import './profile.css';

export default function ProfilePage() {
  const { user, tenant, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const initials = (user?.firstName?.[0] || '') + (user?.lastName?.[0] || '');

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Image must be less than 5MB.');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      // Step 1: Get presigned URL
      const { data: presignData } = await api.post('/auth/avatar/presign', {
        contentType: file.type,
      });

      // Step 2: Upload directly to S3
      await fetch(presignData.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // Step 3: Confirm upload to server
      await api.patch('/auth/avatar', {
        key: presignData.data.key,
      });

      // Step 4: Refresh user data
      await refreshUser();
      setMessage('Avatar updated successfully!');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to upload avatar.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api.patch('/auth/profile', form);
      await refreshUser();
      setEditing(false);
      setMessage('Profile updated successfully!');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return <div className="page-center"><Spinner size="lg" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
      </div>

      <div className="profile-layout">
        {/* Avatar Section */}
        <Card className="profile-avatar-card">
          <Card.Body>
            <div className="profile-avatar-section">
              <div className="profile-avatar-wrapper" onClick={handleAvatarClick}>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Profile" className="profile-avatar-img" />
                ) : (
                  <div className="profile-avatar-placeholder">
                    {initials || <UserIcon size={32} />}
                  </div>
                )}
                <div className="profile-avatar-overlay">
                  <Camera size={20} />
                  <span>Change</span>
                </div>
                {uploading && (
                  <div className="profile-avatar-loading">
                    <Spinner size="sm" />
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                style={{ display: 'none' }}
              />
              <h2 className="profile-name">{user.firstName} {user.lastName}</h2>
              <p className="profile-email">{user.email}</p>
              <p className="profile-role">{user.role}</p>
            </div>
          </Card.Body>
        </Card>

        {/* Info Section */}
        <Card className="profile-info-card">
          <Card.Header>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)' }}>
                Personal Info
              </h2>
              {!editing && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
              )}
            </div>
          </Card.Header>
          <Card.Body>
            {message && (
              <div className={`profile-message ${message.includes('success') ? 'profile-message--success' : 'profile-message--error'}`}>
                {message}
              </div>
            )}

            {editing ? (
              <div className="profile-form">
                <Input
                  id="firstName"
                  label="First Name"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
                <Input
                  id="lastName"
                  label="Last Name"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
                <div className="profile-form-actions">
                  <Button variant="primary" onClick={handleSaveProfile} loading={saving}>Save Changes</Button>
                  <Button variant="ghost" onClick={() => { setEditing(false); setForm({ firstName: user.firstName, lastName: user.lastName }); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="profile-info-list">
                <div className="profile-info-row">
                  <span className="profile-info-label">First Name</span>
                  <span className="profile-info-value">{user.firstName}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-label">Last Name</span>
                  <span className="profile-info-value">{user.lastName}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-label">Email</span>
                  <span className="profile-info-value">{user.email}</span>
                </div>
                <div className="profile-info-row">
                  <span className="profile-info-label">Role</span>
                  <span className="profile-info-value" style={{ textTransform: 'capitalize' }}>{user.role}</span>
                </div>
                {tenant && (
                  <div className="profile-info-row">
                    <span className="profile-info-label">Organization</span>
                    <span className="profile-info-value">{tenant.businessName}</span>
                  </div>
                )}
              </div>
            )}
          </Card.Body>
        </Card>

        {/* Danger Zone */}
        <Card className="profile-danger-card">
          <Card.Body>
            <div className="profile-danger-section">
              <div>
                <h3 className="profile-danger-title">Sign Out</h3>
                <p className="profile-danger-desc">Sign out from your current session on this device.</p>
              </div>
              <Button variant="danger" size="sm" onClick={handleLogout}>
                <LogOut size={14} style={{ marginRight: 6 }} /> Sign Out
              </Button>
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}