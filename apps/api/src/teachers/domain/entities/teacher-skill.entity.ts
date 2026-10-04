export class TeacherSkill {
  constructor(
    public readonly id: string,
    public readonly teacherId: string,
    public readonly bookId: string,
    public readonly createdAt: Date,
    public readonly bookName?: string,
    public readonly bookLevel?: string,
  ) {}
}
