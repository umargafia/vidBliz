import express from 'express';
import bodyParser from 'body-parser';
import videoRoutes from './modules/video/routes/video.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Route to generate video
app.use('/video', videoRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
