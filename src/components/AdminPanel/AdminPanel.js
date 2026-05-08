import React, { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../config';
import { buildAuthHeaders } from '../../utils/auth';
import './AdminPanel.css';

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleTogglePanel = async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.get(`${API_URL}/admin/users`, {
        headers: buildAuthHeaders()
      });

      setUsers(response.data);
      setIsOpen(true);
    } catch (err) {
      console.error('Admin users fetch error:', err);
      setError(err.response?.data || 'Unable to load admin data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    const confirmed = window.confirm('Delete this user completely? This cannot be undone.');

    if (!confirmed) {
      return;
    }

    setDeletingUserId(userId);
    setError('');

    try {
      await axios.delete(`${API_URL}/admin/users/${userId}`, {
        headers: buildAuthHeaders()
      });

      // Remove the deleted user locally so the admin sees instant feedback.
      setUsers((prevUsers) => prevUsers.filter((user) => user.id !== userId));
    } catch (err) {
      console.error('Admin delete user error:', err);
      setError(err.response?.data || 'Unable to delete user.');
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <button
          className="admin-panel-button"
          onClick={handleTogglePanel}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : isOpen ? 'Hide Users' : 'View Users'}
        </button>
      </div>

      {error && <p className="admin-panel-error">{error}</p>}

      {isOpen && (
        <div className="admin-panel-card">
          <p className="admin-panel-title">Registered users</p>
          <div className="admin-panel-list">
            {users.map((user) => (
              <article key={user.id} className="admin-panel-user">
                <div className="admin-panel-user-copy">
                  <p>{user.name}</p>
                  <p>{user.email}</p>
                  <p>Entries: {user.entries}</p>
                </div>
                <button
                  className="admin-panel-delete-button"
                  onClick={() => handleDeleteUser(user.id)}
                  disabled={deletingUserId === user.id}
                >
                  {deletingUserId === user.id ? 'Deleting...' : 'Delete'}
                </button>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminPanel;
