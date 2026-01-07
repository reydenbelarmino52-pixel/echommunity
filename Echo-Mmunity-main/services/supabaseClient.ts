import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wyqkyqmleojkpegpipyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5cWt5cW1sZW9qa3BlZ3BpcHluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MDgwMjgsImV4cCI6MjA4MzI4NDAyOH0.g-RtQ6RprSIZlPMUNV5L5Il0r8IBskNhurpvTmPFLDc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);