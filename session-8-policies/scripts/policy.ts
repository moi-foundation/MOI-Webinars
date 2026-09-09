// What does the chain say about the owner's policy right now?
import { config, ownerAccount, rawRpc } from "@demo/shared";

const owner = await ownerAccount();
const policy = await rawRpc<unknown>("moi.AccessPolicy", [{
  id: owner.address,
  resource_type: "storage",
  resource_id: config.logicId,
  options: { tesseract_number: -1 },
}]).catch(() => null);

console.log(policy ? JSON.stringify(policy, null, 2) : "no policy on this account");
