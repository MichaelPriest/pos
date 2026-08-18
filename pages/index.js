import { useState } from 'react';
import axios from 'axios';
const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://backend-restaurant-booking-system.vercel.app/';
export default function Home() {
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    guests: 1,
    name: '',
    contact: '',
  });
  const [message, setMessage] = useState('');
  const [availability, setAvailability] = useState([]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const checkAvailability = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/api/bookings`, {
        params: { date: formData.date, time: formData.time },
      });
      setAvailability(response.data.availableSlots);
    } catch (error) {
      console.error(error);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${BASE_URL}/api/bookings`, formData);
      setMessage(response.data.message);
    } catch (error) {
      console.error(error);
      setMessage('Error booking the table');
    }
  };
  
  return (
    <div>
      <h1>Restaurant Table Booking</h1>
      <form onSubmit={handleSubmit}>
        <input type="date" name="date" onChange={handleInputChange} required />
        <input type="time" name="time" onChange={handleInputChange} required />
        <input
          type="number"
          name="guests"
          min="1"
          onChange={handleInputChange}
          required
        />
        <input
          type="text"
          name="name"
          placeholder="Your Name"
          onChange={handleInputChange}
          required
        />
        <input
          type="text"
          name="contact"
          placeholder="Contact Details"
          onChange={handleInputChange}
          required
        />
        <button type="button" onClick={checkAvailability}>
          Check Availability
        </button>
        <button type="submit">Book Table</button>
      </form>
      <div>
        <h2>Available Slots</h2>
        {availability.length > 0
          ? availability.map((slot, index) => <p key={index}>{slot}</p>)
          : 'No slots available'}
      </div>
      {message && <p>{message}</p>}
    </div>
  );
}
