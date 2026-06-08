const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');
const notificationsRoutes = require('./routes/notifications');
const activitiesRoutes = require('./routes/activities');
const permissionsRoutes = require('./routes/permissions');
const usersRoutes = require('./routes/users');

const app = express();

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/users', usersRoutes);

app.get('/health', (req, res) => res.json({ status: 'OK' }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
