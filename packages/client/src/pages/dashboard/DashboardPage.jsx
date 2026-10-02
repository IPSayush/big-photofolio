/**
 * Photographer Dashboard - FR-MON-001.
 * Shows totals, per-event stats, and quota remaining.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Card, StatCard, Badge, Spinner, Button, EmptyState } from '../../components/common';
import { CalendarDays, Camera, Users, Link2, HardDrive, CheckCircle } from '../../components/Icons';
import './dashboard.css';

/* Helper: wraps SVG icon in the stat-card icon container */
function iconEl(IconComp) {
  return <IconComp size={22} />;
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard')
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="page-center"><Spinner size="lg" /></div>;
  }

  if (error) {
    return <div className="page-center"><p className="error-text">{error}</p></div>;
  }

  const { totals, events, plan, quotaRemaining } = data;

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <Link to="/events/new">
          <Button variant="primary">+ New Event</Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard icon={iconEl(CalendarDays)} label="Events" value={totals.events} />
        <StatCard icon={iconEl(Camera)} label="Photos" value={totals.totalPhotos} />
        <StatCard icon={iconEl(Users)} label="Guests" value={totals.totalGuests} />
        <StatCard icon={iconEl(Link2)} label="AI Matches" value={totals.totalMatches} />
        <StatCard icon={iconEl(HardDrive)} label="Storage" value={formatBytes(totals.totalStorageBytes)} />
        <StatCard icon={iconEl(CheckCircle)} label="Processed" value={totals.processedPhotos} />
      </div>

      {/* Quota */}
      {plan && quotaRemaining && (
        <Card className="dashboard__quota">
          <Card.Header>
            <div className="dashboard__quota-header">
              <h2>Plan: {plan.name}</h2>
              <Link to="/subscription"><Button variant="ghost" size="sm">Manage</Button></Link>
            </div>
          </Card.Header>
          <Card.Body>
            <div className="quota-grid">
              <QuotaBar label="Events" used={totals.events} max={plan.quotas.maxEvents} />
              <QuotaBar label="Storage" used={totals.totalStorageBytes} max={plan.quotas.maxStorageBytes} format={formatBytes} />
              <QuotaBar label="AI Matches" used={totals.totalMatches} max={plan.quotas.maxAiMatchesPerMonth} />
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Events List */}
      <div className="dashboard__events">
        <h2 className="section-title">Recent Events</h2>
        {events.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={48} />}
            title="No events yet"
            description="Create your first event to get started"
            action={<Link to="/events/new"><Button variant="primary">Create Event</Button></Link>}
          />
        ) : (
          <div className="events-grid">
            {events.slice(0, 6).map((event) => (
              <Link to={`/events/${event._id}`} key={event._id} className="event-card-link">
                <Card hover>
                  <Card.Body>
                    <div className="event-card__top">
                      <h3 className="event-card__name">{event.name}</h3>
                      <Badge variant={event.status === 'active' ? 'success' : 'default'}>
                        {event.status}
                      </Badge>
                    </div>
                    <p className="event-card__venue">{event.venue}</p>
                    <p className="event-card__date">
                      {new Date(event.dateStart).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                    <div className="event-card__stats">
                      <span><Camera size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />{event.stats?.photoCount || 0}</span>
                      <span><Users size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />{event.stats?.guestCount || 0}</span>
                      <span><Link2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />{event.stats?.matchCount || 0}</span>
                    </div>
                  </Card.Body>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuotaBar({ label, used, max, format }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const displayUsed = format ? format(used) : used;
  const displayMax = format ? format(max) : max;

  return (
    <div className="quota-bar">
      <div className="quota-bar__header">
        <span className="quota-bar__label">{label}</span>
        <span className="quota-bar__values">{displayUsed} / {displayMax}</span>
      </div>
      <div className="quota-bar__track">
        <div
          className={`quota-bar__fill ${pct > 90 ? 'quota-bar__fill--danger' : pct > 70 ? 'quota-bar__fill--warning' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}