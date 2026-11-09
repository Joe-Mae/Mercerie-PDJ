insert into public.boutiques (id, nom, code, devise, fuseau_horaire)
values (
  'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c',
  'Mercerie PDJ',
  'PDJ',
  'XOF',
  'Africa/Lome'
)
on conflict (id) do nothing;

insert into public.categories (id, boutique_id, nom, code_court)
values
  ('c1111111-1111-4111-8111-111111111111', 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c', 'Tissus', 'TIS'),
  ('c2222222-2222-4222-8222-222222222222', 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c', 'Fils', 'FIL'),
  ('c3333333-3333-4333-8333-333333333333', 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c', 'Rubans', 'RUB'),
  ('c4444444-4444-4444-8444-444444444444', 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c', 'Boutons', 'BOU'),
  ('c5555555-5555-4555-8555-555555555555', 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c', 'Aiguilles', 'AIG'),
  ('c6666666-6666-4666-8666-666666666666', 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c', 'Fermetures', 'FER'),
  ('c7777777-7777-4777-8777-777777777777', 'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c', 'Prestations', 'PRE')
on conflict (id) do nothing;

insert into public.services (id, boutique_id, nom, prix_defaut_xof)
values
  (
    'd1111111-1111-4111-8111-111111111111',
    'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c',
    'Surfilage',
    null
  ),
  (
    'd2222222-2222-4222-8222-222222222222',
    'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c',
    'Plissage',
    null
  )
on conflict (id) do nothing;

insert into public.settings (boutique_id, key, value)
values (
  'b7e2c1a4-5d6f-4e8a-9b0c-1d2e3f4a5b6c',
  'ticket_message',
  '"Merci de votre visite à la Mercerie PDJ."'::jsonb
)
on conflict (boutique_id, key) do nothing;

comment on table public.stock_levels is
  'Projection du registre des mouvements. Jamais modifiée directement par l’application.';
comment on column public.variants.seuil_alerte is
  'Seuil exprimé en unité canonique : centimètres pour les tissus, pièces sinon.';
comment on table public.stock_movements is
  'Registre append-only : toute correction crée un nouveau mouvement motivé.';
