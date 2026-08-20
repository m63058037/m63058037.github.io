INSERT INTO storage.buckets (id, name)
SELECT 'post-images', 'post-images'
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'post-images');

DROP POLICY IF EXISTS "Public access to post images" ON storage.objects;
CREATE POLICY "Public access to post images" 
  ON storage.objects 
  FOR SELECT 
  USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "Authenticated users can upload post images" ON storage.objects;
CREATE POLICY "Authenticated users can upload post images" 
  ON storage.objects 
  FOR INSERT 
  WITH CHECK (bucket_id = 'post-images' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update post images" ON storage.objects;
CREATE POLICY "Authenticated users can update post images" 
  ON storage.objects 
  FOR UPDATE 
  USING (bucket_id = 'post-images' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete post images" ON storage.objects;
CREATE POLICY "Authenticated users can delete post images" 
  ON storage.objects 
  FOR DELETE 
  USING (bucket_id = 'post-images' AND auth.uid() IS NOT NULL);

SELECT 'Post images storage policy created successfully' AS result;