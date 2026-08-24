const SUPABASE_URL = 'https://rfceapkvgnmzqpbgxuus.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY2VhcGt2Z25tenFwYmd4dXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTcwMzcsImV4cCI6MjA5ODQ5MzAzN30.mx2H073geEf-eV-kXEzwoIjfCRPfm0JT0U-379uG7-U';

let supabaseClient;

if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  throw new Error('Supabase SDK not loaded. Please add <script src="../assets/js/supabase.js"></script> before loading this module.');
}

export const supabase = supabaseClient;

export const config = {
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  adminUid: '10281028',
  avatarStoragePath: 'avatars',
  postImageStoragePath: 'post-images',
  maxPostImageSize: 5 * 1024 * 1024,
  maxAvatarSize: 1 * 1024 * 1024,
  defaultAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=',
  jwtExpiryMinutes: 60 * 24,
  loginRateLimit: 5,
  loginRateLimitWindowMs: 60 * 1000
};

export default config;
