ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_schedule_date_unique" UNIQUE("class_id","schedule_id","session_date");
