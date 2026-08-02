import mongoose from 'mongoose';
import { AllData } from '../types';

const appDataSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  data: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

export default mongoose.model('AppData', appDataSchema);
