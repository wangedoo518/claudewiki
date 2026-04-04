import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AnthropicProviderListPopoverProps {
  providerNames: string[];
}

export function AnthropicProviderListPopover({
  providerNames,
}: AnthropicProviderListPopoverProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle
          size={14}
          className="cursor-pointer text-muted-foreground"
        />
      </TooltipTrigger>
      <TooltipContent side="right" className="w-[220px] p-3">
        <div className="mb-2 text-[12px] font-medium">支持的服务商</div>
        <div className="flex flex-col gap-1.5">
          {providerNames.length > 0 ? (
            providerNames.map((name) => (
              <div key={name} className="text-[12px] text-foreground">
                {name}
              </div>
            ))
          ) : (
            <div className="text-[12px] text-muted-foreground">
              暂无 Anthropic 兼容服务商
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
