/**
 * Event List Page - lists photographer's events.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Card, Badge, Button, Spinner, EmptyState } from '../../components/common';
import { Camera, Users, Link2, CalendarDays } from '../../components/Icons';
import '../dashboard/dashboard.css';

export default function EventListPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/events')
      .then(({ data }) => setEvents(data.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-center"><Spinner size="lg" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Events</h1>
        <Link to="/events/new"><Button variant="primary">+ New Event</Button></Link>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={48} />}
          title="No events yet"
          description="Create your first event to start uploading photos and onboarding guests."
          action={<Link to="/events/new"><Button variant="primary">Create Event</Button></Link>}
        />
      ) : (
        <div className="events-grid">
          {events.map((event) => (
            <Link to={`/events/${event._id}`} key={event._id} className="event-card-link">
              <Card hover>
                <Card.Body>
                  <div className="event-card__top">
                    <h3 className="event-card__name">{event.name}</h3>
                    <Badge variant={event.status === 'active' ? 'success' : event.status === 'archived' ? 'default' : 'warning'}>
                      {event.status}
                    </Badge>
                  </div>
                  <p className="event-card__venue">{event.venue}</p>
                  <p className="event-card__date">
                    {new Date(event.dateStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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
  );
}
