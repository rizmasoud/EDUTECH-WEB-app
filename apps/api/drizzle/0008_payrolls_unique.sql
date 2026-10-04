ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_teacher_id_academic_term_id_unique" UNIQUE("teacher_id","academic_term_id");
