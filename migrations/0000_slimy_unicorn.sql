CREATE TYPE "public"."leaderboard_period" AS ENUM('week', 'month', 'season');--> statement-breakpoint
CREATE TYPE "public"."match_result_status" AS ENUM('pending', 'confirmed', 'disputed', 'admin_set', 'void');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'in_progress', 'complete', 'void');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('score_pending', 'score_confirmed', 'score_disputed', 'pending_expired', 'score_overridden', 'tier_promoted', 'registration_confirmed');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('registered', 'waitlist', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."tier_change_reason" AS ENUM('initial', 'auto_promote', 'auto_demote', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('bronze', 'silver', 'gold', 'platinum', 'diamond');--> statement-breakpoint
CREATE TYPE "public"."tournament_format" AS ENUM('americano', 'mexicano', 'round_robin', 'bracket');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('draft', 'open', 'in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."tournament_type" AS ENUM('open', 'club_internal', 'group', 'casual');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "club_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_club" UNIQUE("user_id","club_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text DEFAULT 'Phuket' NOT NULL,
	"description" text,
	"court_count" integer,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" "leaderboard_period" NOT NULL,
	"period_start" date NOT NULL,
	"tier" "tier" NOT NULL,
	"player_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"points_sum" numeric(10, 2) NOT NULL,
	"match_count" integer NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"rebuilt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_period_tier_player" UNIQUE("period","period_start","tier","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_a_score" integer NOT NULL,
	"team_b_score" integer NOT NULL,
	"submitted_by" uuid NOT NULL,
	"confirmed_by" uuid,
	"status" "match_result_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "match_results_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"team_a" uuid[] NOT NULL,
	"team_b" uuid[] NOT NULL,
	"scheduled_at" timestamp with time zone,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"tier" "tier" DEFAULT 'bronze' NOT NULL,
	"home_club_id" uuid,
	"bio" text,
	"photo_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "players_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"points" numeric(8, 2) NOT NULL,
	"breakdown" jsonb NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "uq_player_match" UNIQUE("player_id","match_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'registered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tournament_player" UNIQUE("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tier_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"tier" "tier" NOT NULL,
	"from_date" timestamp with time zone NOT NULL,
	"to_date" timestamp with time zone,
	"reason" "tier_change_reason" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" "tournament_format" NOT NULL,
	"tournament_type" "tournament_type" DEFAULT 'club_internal' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"tier_min" "tier",
	"tier_max" "tier",
	"status" "tournament_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brackets" ADD CONSTRAINT "brackets_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_results" ADD CONSTRAINT "match_results_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_results" ADD CONSTRAINT "match_results_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_home_club_id_clubs_id_fk" FOREIGN KEY ("home_club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "registrations" ADD CONSTRAINT "registrations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_history" ADD CONSTRAINT "tier_history_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lb_rank" ON "leaderboard_snapshots" USING btree ("period","period_start","tier","rank");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_user_unread" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ledger_player_earned" ON "points_ledger" USING btree ("player_id","earned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tournaments_club_start" ON "tournaments" USING btree ("club_id","start_at");