import React, { useEffect, useState } from 'react';
import { reservationService } from '../services/reservationService';
import { Reservation } from '../types';

const TestReservations: React.FC = () => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    reservationService.getAll()
      .then(data => {
        setReservations(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load reservations');
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading reservations...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Reservations ({reservations.length})</h2>
      <ul className="space-y-2">
        {reservations.map(res => (
          <li key={res.id} className="border p-2 rounded">
            {res.personName} – {res.carModel} – {res.startDate} to {res.endDate}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TestReservations;
