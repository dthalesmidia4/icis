-- Atualizar o limite de tamanho do bucket card-attachments para 400MB
UPDATE storage.buckets 
SET file_size_limit = 419430400 -- 400MB em bytes
WHERE id = 'card-attachments';