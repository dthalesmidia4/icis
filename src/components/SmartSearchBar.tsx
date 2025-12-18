import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search, Mic, MicOff, X, Loader2, Calendar } from "lucide-react";
import { useVoiceSearch } from "@/hooks/useVoiceSearch";
import { useSmartSearch, SearchResult, SearchableItem, formatSearchResultDate } from "@/hooks/useSmartSearch";

interface SmartSearchBarProps<T extends SearchableItem> {
  items: T[];
  onResultSelect: (item: T) => void;
  placeholder?: string;
  className?: string;
  maxResults?: number;
}

export function SmartSearchBar<T extends SearchableItem>({
  items,
  onResultSelect,
  placeholder = "Pesquisar por tarefa, cliente, anexo, data, mês, palavra-chave…",
  className,
  maxResults = 8,
}: SmartSearchBarProps<T>) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Voice search hook
  const {
    isListening,
    isSupported: isVoiceSupported,
    transcript,
    startListening,
    stopListening,
    cancelListening,
    error: voiceError,
  } = useVoiceSearch({
    onTranscript: (text) => {
      setQuery(text);
      setIsOpen(true);
    },
  });
  
  // Smart search hook
  const results = useSmartSearch({
    items,
    searchQuery: query,
    maxResults,
  });
  
  // Update query when voice transcript changes during listening
  useEffect(() => {
    if (isListening && transcript) {
      setQuery(transcript);
    }
  }, [transcript, isListening]);
  
  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex].item);
        }
        break;
      case "Escape":
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };
  
  const handleSelect = useCallback((item: T) => {
    onResultSelect(item);
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }, [onResultSelect]);
  
  const handleClear = () => {
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  };
  
  const handleVoiceClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };
  
  const handleVoiceCancel = () => {
    cancelListening();
    setQuery("");
  };
  
  const showDropdown = isOpen && (results.length > 0 || query.trim().length > 0);
  
  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && setIsOpen(true)}
          placeholder={placeholder}
          className={cn(
            "pl-10 pr-20 h-11 text-sm bg-background border-border/60",
            "focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/50",
            isListening && "border-red-500/50 ring-2 ring-red-500/20"
          )}
        />
        
        {/* Right side buttons */}
        <div className="absolute right-2 flex items-center gap-1">
          {/* Clear button */}
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          {/* Voice button */}
          {isVoiceSupported && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                isListening 
                  ? "text-red-500 hover:text-red-600 animate-pulse" 
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={handleVoiceClick}
              title={isListening ? "Parar gravação" : "Pesquisar por voz"}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
      
      {/* Voice Recording Indicator */}
      {isListening && (
        <div className="absolute top-full left-0 right-0 mt-1 p-3 bg-card border border-red-500/30 rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-red-500">Gravando...</span>
              {transcript && (
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  "{transcript}"
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleVoiceCancel}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
      
      {/* Voice Error */}
      {voiceError && !isListening && (
        <div className="absolute top-full left-0 right-0 mt-1 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <p className="text-sm text-destructive">{voiceError}</p>
        </div>
      )}
      
      {/* Results Dropdown */}
      {showDropdown && !isListening && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50">
          {results.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <p className="text-sm">Nenhum resultado encontrado para "{query}"</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[320px] overflow-auto">
              <div className="p-1">
                {results.map((result, index) => (
                  <SearchResultItem
                    key={result.item.id}
                    result={result}
                    isSelected={index === selectedIndex}
                    onClick={() => handleSelect(result.item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}

interface SearchResultItemProps<T extends SearchableItem> {
  result: SearchResult<T>;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function SearchResultItem<T extends SearchableItem>({
  result,
  isSelected,
  onClick,
  onMouseEnter,
}: SearchResultItemProps<T>) {
  const { item, matchedFields } = result;
  const dateDisplay = item.delivery_date ? formatSearchResultDate(item.delivery_date) : null;
  
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors",
        isSelected ? "bg-primary/10" : "hover:bg-muted/50"
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {item.title}
        </p>
        {matchedFields.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Encontrado em: {matchedFields.join(", ")}
          </p>
        )}
      </div>
      
      <div className="flex items-center gap-2 shrink-0">
        {dateDisplay && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {dateDisplay}
          </div>
        )}
        {item.clientName && (
          <Badge 
            variant="secondary" 
            className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20 font-medium whitespace-nowrap"
          >
            {item.clientName}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default SmartSearchBar;
