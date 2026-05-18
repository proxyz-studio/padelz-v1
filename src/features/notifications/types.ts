export type NotificationType =
  | 'score_pending'
  | 'score_confirmed'
  | 'score_disputed'
  | 'pending_expired'
  | 'score_overridden'
  | 'tier_promoted'
  | 'registration_confirmed';

export type CreateNotificationInput = {
  user_ids: string[];
  type: NotificationType;
  payload: Record<string, unknown>;
};
