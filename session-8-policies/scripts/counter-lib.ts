import { getLogicDriver } from "js-moi-sdk";
import { LockType } from "js-moi-utils";
import { config, type Account } from "@demo/shared";

/** Read a participant's counter. Static call, free. No actor state yet reads as zero. */
export async function counterOf(reader: Account, subject: string): Promise<bigint> {
  const logic = await getLogicDriver(config.logicId, reader.wallet);
  const res = await logic.routines.CounterOf!(subject).call({
    participants: [{ id: subject as `0x${string}`, lock_type: LockType.READ_LOCK }],
  });
  const { output, error } = await res.result();
  if (error) return 0n;
  return BigInt(output?.counter ?? 0);
}
