// Example module case (keep it: it shows the pattern and checks Pack): an encrypted archive entry read and decrypted
// into a fresh buffer must show up in the dump as plain text.
#include "../fakegame.h"
int CaseExample(FakeGame &g) {
 std::string text = Repeat(Encode(L"「おはよう、今日もいい天気だね」と彼女は笑った。\r\n", 932), 10);
 Pack p; p.Write("data.fpk", { { "scene/opening.txt", text } });
 DWORD n = 0; char *plain = p.ReadFresh("scene/opening.txt", &n); g.Hold(plain);
 Sleep(1200);
 if (!Saved(g.dir, text, NULL)) { printf("FAIL example: archive entry decrypted into a fresh buffer not saved\n"); return 1; }
 return 0;
}
