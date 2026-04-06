
UPDATE public.bills_payable
SET amount = NULL, attachment_url = NULL, attachment_name = NULL, observations = NULL
WHERE parent_bill_id = '55d90373-d449-4d7d-8956-b7c5c99b3f21'
AND paid_at IS NULL;
