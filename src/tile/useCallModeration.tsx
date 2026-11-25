/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, MenuItem } from "@vector-im/compound-web";
import {
  LeaveIcon,
  MicOffIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { Modal } from "../Modal";
import { FieldRow } from "../input/Input";
import { useBehavior } from "../useBehavior";
import {
  type CallControlMember,
  type CallModerationAction,
} from "../callTermination/CallModeration";
import { type RemoteUserMediaViewModel } from "../state/media/RemoteUserMediaViewModel";

export interface CallModerationProps {
  onModerate?: (
    target: CallControlMember,
    action: CallModerationAction,
  ) => void;
  moderationPending?: boolean;
}

export function useCallModeration(
  media: RemoteUserMediaViewModel,
  name: string,
  onModerate: CallModerationProps["onModerate"],
  pending = false,
): { items: ReactNode; confirmation: ReactNode } {
  const { t } = useTranslation();
  const audioEnabled = useBehavior(media.audioEnabled$);
  const [removeTarget, setRemoveTarget] = useState<CallControlMember | null>(
    null,
  );
  const dismissRemove = useCallback(() => setRemoveTarget(null), []);
  const target = media.callControlTarget;
  if (!target || !onModerate) return { items: null, confirmation: null };

  return {
    items: (
      <>
        <MenuItem
          Icon={MicOffIcon}
          label={t("video_tile.close_microphone")}
          disabled={pending || !audioEnabled}
          onSelect={() => onModerate(target(), "mute")}
        />
        <MenuItem
          Icon={LeaveIcon}
          label={t("video_tile.remove_from_call")}
          kind="critical"
          disabled={pending}
          onSelect={() => setRemoveTarget(target())}
        />
      </>
    ),
    confirmation: removeTarget && (
      <Modal
        title={t("video_tile.remove_from_call_confirm", { name })}
        open
        onDismiss={dismissRemove}
      >
        <FieldRow>
          <Button kind="secondary" onClick={dismissRemove}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            destructive
            disabled={pending}
            onClick={() => {
              dismissRemove();
              onModerate(removeTarget, "remove");
            }}
          >
            {t("video_tile.remove_from_call")}
          </Button>
        </FieldRow>
      </Modal>
    ),
  };
}
