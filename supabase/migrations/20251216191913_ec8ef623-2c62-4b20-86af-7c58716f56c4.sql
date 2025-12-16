-- Atualizar o limite de tamanho do bucket card-attachments para 100MB (104857600 bytes)
UPDATE storage.buckets 
SET file_size_limit = 104857600 
WHERE id = 'card-attachments';