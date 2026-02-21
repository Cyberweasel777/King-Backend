-- Referral program tables for Stripe-tied conversions
-- Run in Supabase SQL editor or your migration pipeline

create extension if not exists pgcrypto;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  external_user_id text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (app_id, external_user_id),
  unique (app_id, code)
);

create index if not exists idx_referral_codes_app_code
  on public.referral_codes(app_id, code);

create table if not exists public.referral_conversions (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  referrer_external_user_id text not null,
  referred_external_user_id text not null,
  checkout_session_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'converted',
  reward_months integer not null default 1,
  payout_cents integer not null default 0,
  converted_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (app_id, referred_external_user_id)
);

create index if not exists idx_referral_conversions_referrer
  on public.referral_conversions(app_id, referrer_external_user_id);
