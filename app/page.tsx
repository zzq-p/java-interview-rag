"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, BrainCircuit, ChevronRight, Clock3, FileCode2, FileText, Library, Loader2, Plus, RotateCcw, Send, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

type DocumentItem = { id: number; name: string; size: number; chunkCount: number; createdAt: string };
type Question = { id: string; topic: string; question: string; evaluationPoints: string[]; referenceAnswer: string; excerpt: string; documentName: string; position: number; difficulty: string; sourceId: number };
type Feedback = { score: number; summary: string; coveredPoints: string[]; missingPoints: string[]; improvement: string; referenceAnswer: string };

export default function Home() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [difficulty, setDifficulty] = useState("中等");
  const [count, setCount] = useState("5");
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { answer: string; feedback: Feedback | null }>>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const current = questions[questionIndex];
  const answer = current ? answers[current.id]?.answer ?? "" : "";
  const feedback = current ? answers[current.id]?.feedback ?? null : null;
  const answered = questions.filter((question) => Boolean(answers[question.id]?.feedback)).length;
  const totalChunks = useMemo(() => documents.reduce((total, document) => total + document.chunkCount, 0), [documents]);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch("/api/documents");
      const data = await response.json() as { documents?: DocumentItem[]; error?: string };
      if (!response.ok || !data.documents) throw new Error(data.error || "无法加载资料库");
      setDocuments(data.documents);
      setDocumentsError("");
    } catch (error) { setDocumentsError(error instanceof Error ? error.message : "无法加载资料库"); }
    finally { setDocumentsLoading(false); }
  }, []);

  useEffect(() => { const timer = setTimeout(() => { void loadDocuments(); }, 0); return () => clearTimeout(timer); }, [loadDocuments]);

  const generateQuestions = useCallback(async (override?: { difficulty?: string; topic?: string; count?: number }) => {
    if (!documents.length) {
      toast.error("请先上传自己的资料，再调用模型出题。");
      throw new Error("NO_DOCUMENTS");
    }
    const selectedDifficulty = override?.difficulty ?? difficulty;
    const selectedTopic = override?.topic ?? topic;
    const selectedCount = override?.count ?? Number(count);
    setGenerating(true);
    try {
      const response = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ difficulty: selectedDifficulty, topic: selectedTopic, count: selectedCount }) });
      const data = await response.json() as { questions?: Question[]; error?: string };
      if (!response.ok || !data.questions?.length) throw new Error(data.error || "没有检索到可用于出题的内容。");
      setQuestions(data.questions);
      setQuestionIndex(0);
      setAnswers({});
      toast.success(`已生成 ${data.questions.length} 道${selectedDifficulty}题`);
      return { generated: data.questions.length, source: "uploaded-documents" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成题目失败";
      toast.error(message);
      throw error;
    } finally { setGenerating(false); }
  }, [count, difficulty, documents.length, topic]);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const controller = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: "generate_interview_questions", title: "生成 Java 面试题",
      description: "从已上传的 Java 资料中检索相关片段，并生成一组面试题。",
      inputSchema: { type: "object", properties: { difficulty: { type: "string", enum: ["入门", "中等", "进阶"] }, topic: { type: "string" }, count: { type: "integer", minimum: 1, maximum: 8 } }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: unknown) => {
        const value = (input && typeof input === "object" ? input : {}) as { difficulty?: string; topic?: string; count?: number };
        return generateQuestions(value);
      },
    }, { signal: controller.signal })).catch(() => undefined);
    return () => controller.abort();
  }, [generateQuestions]);

  async function handleUpload(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("单个文件不能超过 2MB。"); return; }
    setUploading(true);
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch("/api/documents", { method: "POST", body });
      const data = await response.json() as { document?: DocumentItem; error?: string };
      if (!response.ok) throw new Error(data.error || "上传失败");
      await loadDocuments();
      setUploadOpen(false);
      toast.success(`${file.name} 已切片并加入资料库`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "上传失败"); }
    finally { setUploading(false); }
  }

  async function deleteDocument(item: DocumentItem) {
    setDeletingId(item.id);
    try {
      const response = await fetch(`/api/documents?id=${item.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除失败");
      setDocuments((items) => items.filter((document) => document.id !== item.id));
      setQuestions([]);
      setAnswers({});
      setQuestionIndex(0);
      toast.success(`已删除 ${item.name}，请重新出题`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "删除失败"); }
    finally { setDeletingId(null); }
  }

  async function evaluateAnswer() {
    if (!current) return;
    if (answer.trim().length < 15) { toast.error("回答有点短，再展开说说核心机制和使用场景吧。"); return; }
    setEvaluating(true);
    try {
      const response = await fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: current.question, answer, sourceId: current.sourceId, evaluationPoints: current.evaluationPoints }) });
      const data = await response.json() as { feedback?: Feedback; error?: string };
      if (!response.ok || !data.feedback) throw new Error(data.error || "模型点评失败");
      setAnswers((items) => ({ ...items, [current.id]: { answer, feedback: data.feedback! } }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "模型点评失败"); }
    finally { setEvaluating(false); }
  }

  function moveQuestion(direction: 1 | -1) {
    const next = (questionIndex + direction + questions.length) % questions.length;
    setQuestionIndex(next);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" richColors />
      <header className="flex h-16 items-center justify-between border-b border-border px-5 lg:px-8">
        <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_22px_rgba(19,37,36,.18)]"><BrainCircuit className="size-5" /></div><div><div className="font-display text-[17px] font-bold tracking-[-.02em]">码上答</div><div className="text-[11px] font-medium tracking-[.16em] text-muted-foreground">JAVA INTERVIEW LAB</div></div></div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="hidden sm:inline">{documentsError ? "资料库暂不可用" : documentsLoading ? "正在加载资料" : documents.length ? "资料库已就绪" : "等待上传资料"}</span><span className={`size-2 rounded-full ${documentsError ? "bg-destructive" : documents.length ? "bg-[#b8f34a]" : "bg-[#b7b4aa]"}`} /></div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="order-2 border-t border-border bg-[#f4f1e9] px-5 py-5 lg:order-1 lg:border-r lg:border-t-0 lg:px-6 lg:py-7">
          <div className="mb-5 flex items-center justify-between"><div><p className="section-label">知识资料</p><p className="mt-1 text-sm text-muted-foreground">{documents.length ? `${documents.length} 份文档 · ${totalChunks} 个片段` : "上传资料后按内容出题"}</p></div>
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}><DialogTrigger asChild><Button size="icon-sm" aria-label="上传文档" className="rounded-full"><Plus /></Button></DialogTrigger><DialogContent className="border-0 bg-[#fbfaf5] sm:max-w-md"><DialogHeader><DialogTitle className="font-display text-2xl">添加面试资料</DialogTitle><DialogDescription>上传 Java 笔记或团队文档，系统会保存原文件、切分文本并用于检索出题。</DialogDescription></DialogHeader><label onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!uploading) void handleUpload(event.dataTransfer.files[0]); }} className={`mt-2 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center transition ${dragging ? "border-primary bg-[#e8f9c9]" : "border-[#97a09a] bg-white hover:border-primary hover:bg-[#f8faf3]"} ${uploading ? "pointer-events-none opacity-60" : ""}`}>{uploading ? <Loader2 className="mb-3 size-7 animate-spin text-primary" /> : <UploadCloud className="mb-3 size-7 text-primary" />}<span className="font-medium">{uploading ? "正在切分并建立索引…" : "拖入文件，或点击选择"}</span><span className="mt-1 text-xs text-muted-foreground">TXT、Markdown、Java、JSON、XML、CSV、Properties，单个不超过 2MB</span><input className="sr-only" type="file" disabled={uploading} accept=".txt,.md,.java,.json,.xml,.csv,.properties" onChange={(event) => { void handleUpload(event.target.files?.[0]); event.target.value = ""; }} /></label></DialogContent></Dialog>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {documents.map((item) => <DocumentCard key={item.id} item={item} deleting={deletingId === item.id} onDelete={() => void deleteDocument(item)} />)}
            {documentsError && <div role="alert" className="rounded-2xl border border-destructive/40 bg-white p-4 text-sm"><p className="font-semibold">资料库加载失败</p><p className="mt-1 text-muted-foreground">{documentsError}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void loadDocuments()}>重试</Button></div>}
            {!documentsLoading && !documentsError && !documents.length && <div className="rounded-2xl border border-dashed border-[#c8c5ba] bg-white/60 px-4 py-5 text-center"><FileText className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">还没有资料</p><p className="mt-1 text-xs leading-5 text-muted-foreground">上传你的 Java 笔记或团队文档后，系统才会检索并调用模型出题。</p><Button variant="outline" size="sm" className="mt-3 rounded-lg bg-white" onClick={() => setUploadOpen(true)}>上传第一份资料</Button></div>}
          </div>

          <div className="mt-6 rounded-2xl bg-[#142422] p-4 text-white"><div className="flex items-center gap-2 text-sm font-semibold"><Library className="size-4 text-[#b8f34a]" />检索状态</div><p className="mt-3 text-xs leading-5 text-white/60">{documents.length ? "出题时会从已上传资料中查找相关片段，并显示每题的出处。" : "上传资料后即可按内容出题。"}</p><div className="mt-4 flex items-center justify-between text-sm"><span className="text-white/60">可检索片段</span><strong>{totalChunks}</strong></div></div>
        </aside>

        <section className="order-1 min-w-0 px-5 py-7 sm:px-8 lg:order-2 lg:px-12 lg:py-9">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><p className="section-label flex items-center gap-2"><Sparkles className="size-3.5" />基于资料智能出题</p><h1 className="font-display mt-2 max-w-2xl text-3xl font-bold tracking-[-.045em] sm:text-4xl">把读过的 Java 知识，<br className="hidden sm:block" />练成能说出口的答案。</h1></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]"><Input aria-label="出题主题" value={topic} maxLength={100} onChange={(event) => setTopic(event.target.value)} placeholder="主题，如 JVM" className="col-span-2 h-10 min-w-0 rounded-xl bg-white sm:col-span-1 sm:w-36" /><Select value={difficulty} onValueChange={setDifficulty}><SelectTrigger aria-label="难度" className="h-10 w-full rounded-xl bg-white sm:w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="入门">入门</SelectItem><SelectItem value="中等">中等</SelectItem><SelectItem value="进阶">进阶</SelectItem></SelectContent></Select><Button disabled={generating || evaluating || !documents.length} onClick={() => { void generateQuestions().catch(() => undefined); }} className="h-10 rounded-xl bg-[#142422] px-4 text-white hover:bg-[#213936]">{generating ? <Loader2 className="animate-spin" /> : <ArrowRight />}<span>生成题目</span></Button></div>
            </div>

            <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
              {current ? <article className="overflow-hidden rounded-[22px] border border-[#d8d7cf] bg-white shadow-[0_20px_50px_rgba(26,42,40,.07)]">
                <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-7"><div className="flex items-center gap-2.5"><span className="rounded-md bg-[#e8f9c9] px-2 py-1 text-xs font-bold text-[#3c5a19]">Q {String(questionIndex + 1).padStart(2, "0")}</span><span className="text-sm font-semibold">{current.topic}</span></div><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" />建议 3 分钟</span></div>
                <div className="p-5 sm:p-7"><h2 className="font-display text-xl font-bold leading-8 tracking-[-.02em] sm:text-2xl">{current.question}</h2><div className="mt-5 rounded-xl border-l-4 border-[#b8f34a] bg-[#f3f6ee] p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.08em] text-[#58703b]"><BookOpen className="size-3.5" />检索依据</div><p className="mt-2 line-clamp-3 text-sm leading-6 text-[#46514d]">“{current.excerpt}”</p><p className="mt-2 text-xs text-muted-foreground">{current.documentName} · 片段 {current.position}</p></div><Textarea aria-label="我的回答" value={answer} maxLength={10000} onChange={(event) => setAnswers((items) => ({ ...items, [current.id]: { answer: event.target.value, feedback: null } }))} disabled={Boolean(feedback) || evaluating} placeholder="用面试表达方式作答：先下结论，再解释原理，最后补充使用场景或边界条件……" className="mt-5 min-h-36 resize-y rounded-xl bg-[#fbfaf7] p-4 text-base leading-7" />{feedback && <FeedbackPanel feedback={feedback} />}<div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => moveQuestion(-1)} disabled={questions.length < 2 || evaluating}><ArrowLeft />上一题</Button><Button variant="ghost" size="sm" onClick={() => moveQuestion(1)} disabled={questions.length < 2 || evaluating}>下一题<ChevronRight /></Button></div>{feedback ? <Button variant="outline" className="rounded-xl" onClick={() => setAnswers((items) => ({ ...items, [current.id]: { answer: "", feedback: null } }))}><RotateCcw />重新作答</Button> : <Button disabled={evaluating || generating} className="rounded-xl bg-[#b8f34a] text-[#142422] hover:bg-[#a8e23d]" onClick={() => void evaluateAnswer()}>{evaluating ? <Loader2 className="animate-spin" /> : <Send />}调用模型点评</Button>}</div></div>
              </article> : <div className="grid min-h-[320px] place-items-center rounded-[22px] border border-dashed border-[#c8c5ba] bg-white/70 p-7 text-center shadow-[0_20px_50px_rgba(26,42,40,.04)] sm:min-h-[470px]"><div className="max-w-sm"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e8f9c9] text-[#315027]"><UploadCloud className="size-6" /></div><h2 className="font-display mt-5 text-2xl font-bold">{documents.length ? "准备开始练习" : "先上传你自己的资料"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{documents.length ? "选择主题和难度，系统会从资料中检索片段并生成面试题。" : "系统不会使用预置题库。上传后会从你的文档中检索相关片段，再调用模型生成题目和答案点评。"}</p><Button className="mt-5 rounded-xl" disabled={generating} onClick={() => documents.length ? void generateQuestions().catch(() => undefined) : setUploadOpen(true)}>{documents.length ? <Sparkles /> : <Plus />}{documents.length ? "生成题目" : "上传资料"}</Button></div></div>}

              <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-border bg-[#f4f1e9] p-5"><p className="section-label">本轮设置</p><dl className="mt-4 grid gap-3 text-sm"><Setting label="难度" value={difficulty} /><div className="flex items-center justify-between"><dt className="text-muted-foreground">题目数</dt><dd><Select value={count} onValueChange={setCount}><SelectTrigger aria-label="题目数" size="sm" className="w-20 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="3">3 题</SelectItem><SelectItem value="5">5 题</SelectItem><SelectItem value="8">8 题</SelectItem></SelectContent></Select></dd></div><Setting label="资料范围" value="仅上传资料" /></dl></div>
                <div className="rounded-2xl border border-[#25403d] bg-[#1a302d] p-5 text-white"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#b8f34a]">本轮进度</p><div className="mt-3 flex items-end gap-2"><strong className="font-display text-4xl">{answered}</strong><span className="pb-1 text-sm text-white/55">/ {questions.length} 题已作答</span></div><Progress value={Math.min(100, answered / Math.max(questions.length, 1) * 100)} className="mt-4 bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#b8f34a]" /></div>
                <div className="rounded-2xl border border-border bg-white p-5"><div className="flex items-center gap-2 text-sm font-semibold"><BrainCircuit className="size-4 text-[#587c72]" />RAG 出题路径</div><ol className="mt-4 grid gap-3 text-xs text-muted-foreground"><li className="flex gap-2"><Step n="1" />按主题召回相关片段</li><li className="flex gap-2"><Step n="2" />识别知识点并组合问题</li><li className="flex gap-2"><Step n="3" />按原文要点评估回答</li></ol></div>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function DocumentCard({ item, deleting, onDelete }: { item: DocumentItem; deleting: boolean; onDelete: () => void }) {
  const extension = item.name.split(".").pop()?.toUpperCase() || "TXT";
  return <div className="flex items-start gap-3 rounded-xl border border-[#dcd8cd] bg-white p-3 shadow-[0_2px_0_rgba(23,36,35,.04)]"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e7efe8] text-primary">{extension === "JAVA" ? <FileCode2 className="size-4" /> : <FileText className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold" title={item.name}>{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.chunkCount} 个片段 · {(item.size / 1024).toFixed(1)} KB</span></span><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon-xs" disabled={deleting} aria-label={`删除 ${item.name}`} title="删除资料">{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这份资料？</AlertDialogTitle><AlertDialogDescription>将删除“{item.name}”及其检索片段。当前题目也需要重新生成。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onDelete}>删除资料</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}

function FeedbackPanel({ feedback }: { feedback: Feedback }) {
  return <div className="mt-5 rounded-xl border border-[#cfd8c7] bg-[#f7faf2] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold">模型点评</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{feedback.summary}</p></div><div className="grid size-14 shrink-0 place-items-center rounded-full border-4 border-[#b8f34a] bg-white font-display text-xl font-bold">{feedback.score}</div></div><div className="mt-3 flex flex-wrap gap-2">{feedback.coveredPoints.map((item) => <span key={item} className="rounded-full bg-[#dff2c1] px-2.5 py-1 text-xs font-semibold text-[#3f6124]">已覆盖 · {item}</span>)}{feedback.missingPoints.map((item) => <span key={item} className="rounded-full border border-[#ded8ca] bg-white px-2.5 py-1 text-xs text-[#775f3f]">可补充 · {item}</span>)}</div><p className="mt-4 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">改进建议：</strong>{feedback.improvement}</p><details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-[#355d55]">查看模型参考答案</summary><p className="mt-2 leading-6 text-muted-foreground">{feedback.referenceAnswer}</p></details></div>;
}

function Setting({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>; }
function Step({ n }: { n: string }) { return <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#e8f9c9] font-bold text-[#3f6124]">{n}</span>; }
