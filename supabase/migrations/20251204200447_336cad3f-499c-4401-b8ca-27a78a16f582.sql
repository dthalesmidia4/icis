-- Create storage bucket for card attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-attachments', 'card-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for card attachments bucket
CREATE POLICY "Authenticated users can upload card attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'card-attachments');

CREATE POLICY "Authenticated users can update their card attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'card-attachments');

CREATE POLICY "Authenticated users can delete card attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'card-attachments');

CREATE POLICY "Card attachments are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'card-attachments');