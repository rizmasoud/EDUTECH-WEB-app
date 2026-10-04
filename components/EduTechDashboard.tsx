"use client";

import React, { useState } from "react";
import {
  Calendar,
  BookOpen,
  Users,
  UserCheck,
  Award,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Plus,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  RefreshCw,
  Zap,
  Building2,
  GraduationCap,
  Briefcase
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Mock Data Definitions
const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const PERIODS = [
  { id: 1, name: "Period 1", time: "08:00 - 09:30" },
  { id: 2, name: "Period 2", time: "09:45 - 11:15" },
  { id: 3, name: "Period 3", time: "11:30 - 13:00" },
  { id: 4, name: "Period 4", time: "14:00 - 15:30" },
];

interface ScheduleSlot {
  id: string;
  day: string;
  periodId: number;
  className: string;
  subject: string;
  teacher: string;
  room: string;
  hasConflict?: boolean;
}

const INITIAL_SCHEDULE: ScheduleSlot[] = [
  { id: "s1", day: "Saturday", periodId: 1, className: "Grade 10-A", subject: "Mathematics", teacher: "Dr. Alavi", room: "Lab 101" },
  { id: "s2", day: "Saturday", periodId: 2, className: "Grade 10-A", subject: "Physics", teacher: "Prof. Rezaei", room: "Science Lab" },
  { id: "s3", day: "Sunday", periodId: 1, className: "Grade 11-B", subject: "Chemistry", teacher: "Ms. Tehrani", room: "Lab 102" },
  { id: "s4", day: "Monday", periodId: 3, className: "Grade 12-A", subject: "Calculus", teacher: "Dr. Alavi", room: "Hall 201" },
  { id: "s5", day: "Tuesday", periodId: 2, className: "Grade 10-B", subject: "English", teacher: "Mr. Hassani", room: "Room 105" },
  { id: "s6", day: "Wednesday", periodId: 4, className: "Grade 11-A", subject: "Biology", teacher: "Dr. Kamali", room: "Bio Lab", hasConflict: true },
];

const TEACHERS = [
  { id: "t1", name: "Dr. Alavi", subjects: ["Mathematics", "Calculus"], status: "Available", load: 18 },
  { id: "t2", name: "Prof. Rezaei", subjects: ["Physics"], status: "In Class", load: 16 },
  { id: "t3", name: "Ms. Tehrani", subjects: ["Chemistry"], status: "Available", load: 14 },
  { id: "t4", name: "Mr. Hassani", subjects: ["English"], status: "On Leave", load: 12 },
  { id: "t5", name: "Dr. Kamali", subjects: ["Biology"], status: "Available", load: 15 },
];

const SYLLABUS_MODULES = [
  { id: "m1", term: "Term 1", subject: "Mathematics", title: "Algebraic Functions & Quadratic Equations", progress: 85, completedSegments: 12, totalSegments: 14 },
  { id: "m2", term: "Term 1", subject: "Physics", title: "Kinematics & Newtonian Mechanics", progress: 60, completedSegments: 9, totalSegments: 15 },
  { id: "m3", term: "Term 2", subject: "Chemistry", title: "Organic Reactions & Chemical Thermodynamics", progress: 30, completedSegments: 4, totalSegments: 12 },
  { id: "m4", term: "Term 2", subject: "Calculus", title: "Differential Calculus & Rate of Change", progress: 10, completedSegments: 1, totalSegments: 10 },
];

export default function EduTechDashboard() {
  const [activeTab, setActiveTab] = useState<"timetable" | "syllabus" | "substitution" | "payroll">("timetable");
  const [selectedClass, setSelectedClass] = useState("Grade 10-A");
  const [schedule, setSchedule] = useState<ScheduleSlot[]>(INITIAL_SCHEDULE);
  const [isSolving, setIsSolving] = useState(false);
  const [autoResolveMessage, setAutoResolveMessage] = useState<string | null>(null);

  // Auto-solve conflicts simulation
  const handleSolveConflicts = () => {
    setIsSolving(true);
    setAutoResolveMessage(null);
    setTimeout(() => {
      setSchedule((prev) =>
        prev.map((slot) => ({ ...slot, hasConflict: false }))
      );
      setIsSolving(false);
      setAutoResolveMessage("All schedule conflicts resolved automatically using Hard/Soft Constraints Engine!");
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white leading-tight">EduTech Suite</h1>
              <p className="text-xs text-indigo-400 font-medium">Smart Academic & Timetable Intelligence</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
            {[
              { id: "timetable", label: "Timetable Engine", icon: Calendar },
              { id: "syllabus", label: "Syllabus Tracker", icon: BookOpen },
              { id: "substitution", label: "Substitutions", icon: UserCheck },
              { id: "payroll", label: "Payroll Calculator", icon: Briefcase },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              API Connected
            </span>
            <button className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Header Stats */}
      <section className="bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800/80 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Total Active Students</p>
                <p className="text-2xl font-bold text-white mt-1">1,240</p>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" /> +12% this term
                </span>
              </div>
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
                <Users className="h-6 w-6" />
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Active Teachers</p>
                <p className="text-2xl font-bold text-white mt-1">48</p>
                <span className="text-[10px] text-slate-400 mt-1 block">Full-time & Part-time</span>
              </div>
              <div className="p-3 bg-purple-500/10 text-purple-400 rounded-lg">
                <GraduationCap className="h-6 w-6" />
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Weekly Schedule Slots</p>
                <p className="text-2xl font-bold text-white mt-1">144</p>
                <span className="text-[10px] text-emerald-400 mt-1 block">100% Allocated</span>
              </div>
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <Calendar className="h-6 w-6" />
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Schedule Health</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  {schedule.some((s) => s.hasConflict) ? "94% (Conflict)" : "100% Perfect"}
                </p>
                <span className="text-[10px] text-slate-400 mt-1 block">Constraint Engine Active</span>
              </div>
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg">
                <Zap className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {activeTab === "timetable" && (
            <motion.div
              key="timetable"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Controls Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-300">Class:</span>
                  </div>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="bg-slate-950 text-slate-200 border border-slate-700 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Grade 10-A">Grade 10-A</option>
                    <option value="Grade 10-B">Grade 10-B</option>
                    <option value="Grade 11-A">Grade 11-A</option>
                    <option value="Grade 11-B">Grade 11-B</option>
                    <option value="Grade 12-A">Grade 12-A</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  {autoResolveMessage && (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> {autoResolveMessage}
                    </span>
                  )}
                  <button
                    onClick={handleSolveConflicts}
                    disabled={isSolving}
                    className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md transition disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{isSolving ? "Solving Schedule..." : "Auto-Resolve Conflicts"}</span>
                  </button>
                </div>
              </div>

              {/* Timetable Grid */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-slate-800 text-xs font-semibold text-slate-400">
                        <th className="p-4 w-32 border-r border-slate-800">Time / Day</th>
                        {DAYS.map((day) => (
                          <th key={day} className="p-4 text-center border-r border-slate-800/60 last:border-r-0">
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {PERIODS.map((period) => (
                        <tr key={period.id} className="hover:bg-slate-950/30 transition">
                          <td className="p-4 font-semibold text-slate-300 bg-slate-950/40 border-r border-slate-800">
                            <div>{period.name}</div>
                            <div className="text-[10px] text-slate-500 font-normal">{period.time}</div>
                          </td>
                          {DAYS.map((day) => {
                            const slot = schedule.find(
                              (s) => s.day === day && s.periodId === period.id
                            );
                            return (
                              <td
                                key={`${day}-${period.id}`}
                                className="p-2 border-r border-slate-800/40 last:border-r-0 text-center vertical-top"
                              >
                                {slot ? (
                                  <div
                                    className={`p-3 rounded-lg border text-left transition-all relative ${
                                      slot.hasConflict
                                        ? "bg-rose-500/10 border-rose-500/40 text-rose-200"
                                        : "bg-indigo-950/40 border-indigo-800/50 hover:border-indigo-500 text-slate-200"
                                    }`}
                                  >
                                    {slot.hasConflict && (
                                      <span className="absolute top-2 right-2 text-rose-400" title="Teacher Overlap Conflict">
                                        <AlertTriangle className="h-3.5 w-3.5 animate-bounce" />
                                      </span>
                                    )}
                                    <div className="font-bold text-white text-xs">{slot.subject}</div>
                                    <div className="text-[11px] text-indigo-300 mt-1">{slot.teacher}</div>
                                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-1 border-t border-slate-800/50">
                                      <span>{slot.className}</span>
                                      <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px]">{slot.room}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-20 rounded-lg border border-dashed border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-600 hover:text-slate-400 cursor-pointer transition">
                                    <Plus className="h-4 w-4" />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "syllabus" && (
            <motion.div
              key="syllabus"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div>
                  <h2 className="font-bold text-white text-base">Curriculum & Book Segment Progress</h2>
                  <p className="text-xs text-slate-400">Track coverage across academic terms and textbook units.</p>
                </div>
                <button className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold px-3 py-2 rounded-lg">
                  <Plus className="h-4 w-4" />
                  <span>Add Syllabus Module</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SYLLABUS_MODULES.map((mod) => (
                  <div key={mod.id} className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {mod.term} • {mod.subject}
                        </span>
                        <h3 className="font-semibold text-white text-sm mt-2">{mod.title}</h3>
                      </div>
                      <span className="font-bold text-sm text-indigo-400">{mod.progress}%</span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Completed Segments</span>
                        <span>
                          {mod.completedSegments} / {mod.totalSegments} units
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-500"
                          style={{ width: `${mod.progress}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Syllabus On Track
                      </span>
                      <button className="text-indigo-400 hover:text-indigo-300 font-medium text-xs flex items-center gap-1">
                        View Segments <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "substitution" && (
            <motion.div
              key="substitution"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4">
                <h2 className="font-bold text-white text-base">Teacher Absence & Instant Substitution Finder</h2>
                <p className="text-xs text-slate-400">Find substitute teachers matching subject skills without schedule overlaps.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {TEACHERS.map((teacher) => (
                    <div key={teacher.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-white text-sm">{teacher.name}</h3>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                              teacher.status === "Available"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : teacher.status === "In Class"
                                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {teacher.status}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          <span>Skills: </span>
                          <span className="text-slate-200">{teacher.subjects.join(", ")}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          <span>Weekly Hours: </span>
                          <span className="text-slate-200">{teacher.load} hrs</span>
                        </div>
                      </div>

                      <button
                        disabled={teacher.status !== "Available"}
                        className="mt-4 w-full py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-semibold text-xs rounded-lg transition"
                      >
                        Assign as Substitute
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "payroll" && (
            <motion.div
              key="payroll"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4">
                <h2 className="font-bold text-white text-base">Teacher Payroll & Hours Calculation Engine</h2>
                <p className="text-xs text-slate-400">Calculates base pay, teaching session bonuses, and attendance deductions.</p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold">
                        <th className="p-3">Teacher</th>
                        <th className="p-3">Base Hours</th>
                        <th className="p-3">Extra Sessions</th>
                        <th className="p-3">Hourly Rate</th>
                        <th className="p-3">Estimated Monthly Pay</th>
                        <th className="p-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {TEACHERS.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-950/40">
                          <td className="p-3 font-bold text-white">{t.name}</td>
                          <td className="p-3">{t.load} hrs/wk</td>
                          <td className="p-3">4 hrs</td>
                          <td className="p-3">$35.00/hr</td>
                          <td className="p-3 font-bold text-emerald-400">${(t.load * 4 * 35 + 4 * 45).toLocaleString()}</td>
                          <td className="p-3">
                            <button className="text-indigo-400 hover:underline">Generate Payslip</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
