import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";
const Separator = React.forwardRef<React.ElementRef<typeof SeparatorPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>>(({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}, ref) => {});
Separator.displayName = SeparatorPrimitive.Root.displayName;
export { Separator };