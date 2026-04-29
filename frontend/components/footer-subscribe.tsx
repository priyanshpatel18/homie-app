"use client";

import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FooterSubscribe() {
  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <Input.Root>
        <Label.Root htmlFor="footer-email">Email</Label.Root>
        <Input.Wrapper>
          <Input.Input
            id="footer-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Input.Wrapper>
      </Input.Root>
      <FancyButton.Root type="submit" variant="secondary" size="sm">
        Notify me
      </FancyButton.Root>
    </form>
  );
}
