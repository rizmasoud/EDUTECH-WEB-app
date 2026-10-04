ALTER TABLE "teacher_attendance_records" ADD CONSTRAINT "teacher_attendance_records_session_teacher_unique" UNIQUE("class_session_id","teacher_id");
