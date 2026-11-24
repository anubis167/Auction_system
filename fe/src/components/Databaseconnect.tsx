import { useEffect } from 'react';
import api from 'axios';

export default function DatabaseTest() {
  useEffect(() => {
    api.get('/health/db')
      .then(({ data }) => {
        console.log('Neon connection:', data);
      })
      .catch((error) => {
        console.error(
          'API connection failed:',
          error.response?.data ?? error.message
        );
      });
  }, []);

  return <div>Checking database connection...</div>;
}