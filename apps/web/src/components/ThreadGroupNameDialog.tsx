import { useEffect, useState } from "react";
import { create } from "zustand";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";

interface NameRequest {
  readonly title: string;
  readonly submitLabel: string;
  readonly initialName: string;
  readonly resolve: (name: string | null) => void;
}
const useRequest = create<{ request: NameRequest | null }>(() => ({ request: null }));

export function requestThreadGroupName(options: {
  readonly title: string;
  readonly submitLabel: string;
  readonly initialName?: string;
}): Promise<string | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) =>
    useRequest.setState({
      request: { ...options, initialName: options.initialName ?? "", resolve },
    }),
  );
}

function finish(name: string | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(name);
}

export function ThreadGroupNameDialogHost() {
  const request = useRequest((state) => state.request);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resolves a pending name request with null when the host unmounts
  useEffect(() => () => finish(null), []);
  return request ? <ThreadGroupNameDialog request={request} /> : null;
}

function ThreadGroupNameDialog({ request }: { request: NameRequest }) {
  const [name, setName] = useState(request.initialName);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogPopup className="sm:max-w-sm">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length > 0) finish(name.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{request.title}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <Input
              nativeInput
              autoFocus
              aria-label="Group name"
              placeholder="Group name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={name.trim().length === 0}>
              {request.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
