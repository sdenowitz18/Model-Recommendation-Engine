import { useState, useEffect, useRef } from "react";
import { useChatAdvisor, useSessionContext, useClearSession } from "@/hooks/use-advisor";
import { Button } from "@/components/ui/button";
import { TextareaAutosize } from "@/components/ui/textarea-autosize";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Sparkles, User, Loader2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  sessionId: string;
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "assistant",
      content: "Hello! I'm your School Design Advisor from Transcend Education. I'll help you find the best-fit design models for your school by learning about your context step by step.\n\nLet's start with some basics: **Where is your school located, and what grades does it serve?**",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const chatMutation = useChatAdvisor();
  const clearSession = useClearSession();
  const { data: context, refetch: refetchContext } = useSessionContext(sessionId);

  const handleClearConversation = () => {
    clearSession.mutate(sessionId, {
      onSuccess: () => {
        setMessages([
          {
            id: "intro",
            role: "assistant",
            content: "Hello! I'm your School Design Advisor from Transcend Education. I'll help you find the best-fit design models for your school by learning about your context step by step.\n\nLet's start with some basics: **Where is your school located, and what grades does it serve?**",
            timestamp: new Date(),
          },
        ]);
        refetchContext();
      },
    });
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    chatMutation.mutate(
      { sessionId, message: input },
      {
        onSuccess: (data) => {
          const assistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.assistant_message,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-border shadow-sm relative z-10">
      {/* Header */}
      <div className="p-4 border-b border-border bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold font-display text-primary flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent-foreground" />
              Design Advisor
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {context?.isReadyForRecommendation 
                ? "Context established. Recommendations ready." 
                : "Gathering context for recommendations..."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearConversation}
            disabled={clearSession.isPending}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-clear-conversation"
          >
            {clearSession.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            <span className="ml-1.5 text-xs">Start Fresh</span>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden relative">
        <div 
          ref={scrollRef}
          className="h-full overflow-y-auto p-4 space-y-6 scroll-smooth"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex gap-3 max-w-[90%]",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <Avatar className="w-8 h-8 shrink-0">
                  {msg.role === "assistant" ? (
                    <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  ) : (
                    <AvatarFallback className="bg-secondary text-secondary-foreground">
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  )}
                </Avatar>

                <div
                  className={cn(
                    "p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted text-foreground rounded-tl-none border border-border/50"
                  )}
                >
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {chatMutation.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 mr-auto max-w-[80%]"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-muted p-3 rounded-2xl rounded-tl-none flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce"></span>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-white">
        <div className="relative flex items-end gap-2">
          <TextareaAutosize
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="pr-12 min-h-[50px] max-h-[150px] resize-none py-3"
            disabled={chatMutation.isPending}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            className="absolute right-2 bottom-2 h-8 w-8 rounded-lg transition-transform hover:scale-105 active:scale-95"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-center text-muted-foreground mt-2">
          AI can make mistakes. Please verify important information.
        </p>
      </div>
    </div>
  );
}
