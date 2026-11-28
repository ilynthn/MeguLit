// SPDX-License-Identifier: GPL-3.0-or-later
#include "ReplayCases.h"
#include "CmvsUsertestCases.h"
#include "EngineGpuCases.h"
#include "EngineLayerCases.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>

namespace {

using namespace GpuReplay;
using GroupRanks = std::map<std::pair<unsigned, unsigned>, unsigned>;

struct ReplayInput {
 std::vector<GpuReplay::Call> calls;
 GroupRanks groups;
 bool limited = false;
};

void *Key(unsigned id) { return reinterpret_cast<void *>(static_cast<size_t>(id)); }
unsigned Id(void *key) { return static_cast<unsigned>(reinterpret_cast<size_t>(key)); }

struct RecordedGroupOrder {
 const GroupRanks &groups;
 long long operator()(void *rt, void *tex) const {
  const auto key = std::make_pair(Id(rt), Id(tex));
  if (rt) return groups.at(key);
  const auto drawn = groups.find(key);
  // An atlas can be drawn only to offscreen targets. Give its atlas-only key
  // a separate range from the recorded draw groups, which have positive ranks.
  return drawn != groups.end() ? drawn->second : -1 - static_cast<long long>(Id(tex));
 }
};

bool ReadQuads(std::istream &in, GpuReplay::Call &c, size_t &total) {
 unsigned count;
 if (!(in >> count) || count > MaxQuads - total) return false;
 c.quads.resize(count);
 for (Quad &q : c.quads) {
  if (!(in >> q.x0 >> q.y0 >> q.x1 >> q.y1 >> q.u0 >> q.v0 >> q.u1 >> q.v1 >> q.glyph) || !ReplayQuad(q)) return false;
 }
 total += count;
 return true;
}

bool ReadTape(std::istream &in, ReplayInput &tape) {
 in.seekg(0, std::ios::end);
 const auto bytes = in.tellg();
 if (bytes < 0 || bytes > MaxFileBytes) return false;
 in.seekg(0);
 in.imbue(std::locale::classic());
 std::string tag;
 if (!(in >> tag) || tag != "MEGULIT_GPU_REPLAY" || !(in >> tag) || tag != "1") return false;
 size_t quads = 0, text = 0;
 std::set<unsigned> backbufferRanks;
 while (in >> tag) {
  if (tag == "END") {
   if (!(in >> tag) || (tag != "prefix" && tag != "complete")) return false;
   tape.limited = tag == "prefix";
   in >> std::ws;
   return in.eof();
  }
  if (tag.size() != 1 || tape.calls.size() == MaxEvents) return false;
  GpuReplay::Call c{tag[0]};
  unsigned texture = 0, target = 0, group = 0, flag = 0;
  switch (c.op) {
  case 'L': {
   unsigned count;
   if (!(in >> c.tick >> count) || count > MaxLine || count > MaxLineUnits - text) return false;
   c.text.reserve(count);
   for (unsigned j = 0; j < count; ++j) {
    unsigned unit;
    if (!(in >> unit) || !TextToken(unit)) return false;
    c.text += static_cast<wchar_t>(unit);
   }
   text += count;
   break;
  }
  case 'D':
   if (!(in >> c.tick >> texture >> target >> group >> c.tw >> c.th >> c.rw >> c.rh >> c.bw >> c.bh >> flag) ||
       group == 0 || group > MaxEvents || !ReadQuads(in, c, quads)) return false;
   break;
  case 'C':
   if (!(in >> texture) || !ReadQuads(in, c, quads)) return false;
   break;
  case 'F': if (!(in >> c.tick >> c.bw >> c.bh)) return false; break;
  case 'P':
   if (!(in >> c.height >> c.bw >> c.bh >> flag) || !Coordinate(c.height, 1000000)) return false;
   break;
  case 'M': case 'B': if (!(in >> flag)) return false; break;
  case 'O': break;
  default: return false;
  }
  if (flag > 1 || texture > 2 * MaxEvents || target > 2 * MaxEvents ||
      (std::max)({c.tw, c.th, c.rw, c.rh, c.bw, c.bh}) > MaxDimension) return false;
  if (c.op == 'D') {
   const auto entry = tape.groups.emplace(std::make_pair(target, texture), group);
   if (entry.first->second != group) return false;
   if (entry.second && !target && !backbufferRanks.insert(group).second) return false;
  }
  c.tex = Key(texture); c.rt = Key(target); c.flag = flag != 0;
  tape.calls.push_back(std::move(c));
 }
 return false; // A partial write never masquerades as the end of a capture.
}

bool ReadTapeFile(const std::filesystem::path &file, ReplayInput &tape) {
 std::ifstream in(file, std::ios::binary);
 return in.good() && ReadTape(in, tape);
}

std::string Run(const ReplayInput &tape) {
 OrderedGlyphLearner<RecordedGroupOrder> learner(RecordedGroupOrder{tape.groups});
 ReplayOutput out;
 learner.emit = [&](const std::string &s) { out.Message(s); };
 for (const auto &c : tape.calls) {
  switch (c.op) {
  case 'L': learner.Line(c.text, c.tick); break;
  case 'D':
   learner.texRt = c.flag;
   out.Mask(learner.Draw(c.tex, c.tw, c.th, c.rt, c.rw, c.rh, c.bw, c.bh, c.quads, c.tick));
   break;
  case 'C': learner.Composite(c.tex, c.quads); break;
  case 'F': learner.Frame(c.tick, c.bw, c.bh); out.EndFrame(); break;
  case 'P': learner.Preset(c.height, c.bw, c.bh); if (c.flag) learner.pageBlankQuads = true; break;
  case 'M': learner.readOnly = c.flag; break;
  case 'B': learner.bodyRecheck = c.flag; break;
  case 'O': learner.Off(); break;
  }
 }
 return out.rows.str();
}

void Require(bool ok, const char *failure) { if (!ok) throw std::runtime_error(failure); }

std::string Bytes(const std::filesystem::path &file) {
 std::ifstream in(file, std::ios::binary);
 Require(in.good(), "could not open input");
 std::string bytes(std::istreambuf_iterator<char>(in), {});
 size_t written = 0;
 for (size_t i = 0; i < bytes.size(); ++i) {
  if (bytes[i] == '\r' && i + 1 < bytes.size() && bytes[i + 1] == '\n') continue;
  bytes[written++] = bytes[i];
 }
 bytes.resize(written);
 return bytes;
}

void WriteFile(const std::filesystem::path &file, const std::string &bytes) {
 std::ofstream out(file, std::ios::binary);
 out << bytes;
 out.close();
 Require(out.good(), "could not write fixture");
}

std::string Serialized(const Tape &tape, bool limited = false) {
 std::ostringstream out;
 Require(WriteTape(out, tape, limited), "could not serialize replay");
 return out.str();
}

ReplayInput Parse(const std::string &bytes) {
 ReplayInput tape;
 std::istringstream in(bytes);
 Require(ReadTape(in, tape), "invalid or incomplete GPU replay");
 return tape;
}

void Compare(const std::string &expected, const std::string &actual, const char *failure) {
 if (expected == actual) return;
 const auto at = std::mismatch(expected.begin(), expected.end(), actual.begin(), actual.end()).first;
 std::cerr << failure << " at output line " << 1 + std::count(expected.begin(), at, '\n') << '\n';
 throw std::runtime_error(failure);
}

void CheckGroupKeys() {
 const GroupRanks ranks{{{1, 2}, 1}, {{3, 2}, 3}, {{3, 4}, 2}, {{0, 4}, 7}};
 const RecordedGroupOrder order{ranks};
 OrderedGlyphLearner<RecordedGroupOrder> learner(order);
 const auto row = Row(2, 50, 350, 24, 0.1f);
 learner.Line(L"AB", 10000);
 learner.Draw(Key(2), 1024, 2048, Key(1), 640, 480, 640, 480, row, 10001);
 learner.Frame(10002, 640, 480);
 Require(learner.groups.count(learner.GroupKey(Key(1), Key(2))) == 1, "draw group uses a different key");
 Require(learner.atlases.count(order(nullptr, Key(2))) == 1, "learned atlas uses a different key");
 Require(learner.GroupKey(nullptr, Key(4)) == 7, "backbuffer draw and atlas must use the same key");
 const std::vector<int> hidden{0, 1};
 Require(learner.Draw(Key(2), 1024, 2048, Key(3), 640, 480, 640, 480, row, 10003) == hidden,
         "offscreen atlas was not recognized on another target");
 Require(learner.Draw(Key(4), 1024, 2048, Key(3), 640, 480, 640, 480, row, 10003).empty(),
         "a different atlas was hidden");
}

void CheckFormat() {
 const auto reject = [](const std::string &input) {
  std::istringstream in(input);
  ReplayInput bad;
  Require(!ReadTape(in, bad), "invalid replay accepted");
 };
 for (const char *input : {
       "MEGULIT_GPU_REPLAY 1\nO\n",                             // truncated
       "MEGULIT_GPU_REPLAY 1\nL 10000 1 65\nEND complete\n",   // literal text
       "MEGULIT_GPU_REPLAY 1\nM 2\nEND complete\n",            // invalid flag
       "MEGULIT_GPU_REPLAY 1\nB 2\nEND complete\n",
       "MEGULIT_GPU_REPLAY 1\nC 1 1 0 0 1e9 1 0 0 1 1 0\nEND complete\n",
       "MEGULIT_GPU_REPLAY 1\nD 1 1 0 1 32 32 32 32 32 32 0 0\nD 2 1 0 2 32 32 32 32 32 32 0 0\nEND complete\n",
       "MEGULIT_GPU_REPLAY 1\nD 1 1 0 1 32 32 32 32 32 32 0 0\nD 2 2 0 1 32 32 32 32 32 32 0 0\nEND complete\n",
       "MEGULIT_GPU_REPLAY 1\nEND complete\nO\n",
      }) reject(input);
 const auto rejectOverLimit = [&](const char *header, unsigned count, const char *item) {
  std::string input = std::string("MEGULIT_GPU_REPLAY 1\n") + header + std::to_string(count);
  for (unsigned i = 0; i < count; ++i) input += item;
  reject(input + "\nEND complete\n");
 };
 rejectOverLimit("L 10000 ", MaxLine + 1, " 57344");
 rejectOverLimit("C 1 ", MaxQuads + 1, " 0 0 1 1 0 0 1 1 0");

 Tape payloadLimit;
 Require(payloadLimit.Line(std::wstring(MaxLine, L'A'), 10000), "capture refused a line at the limit");
 Require(!payloadLimit.Line(std::wstring(MaxLine + 1, L'A'), 10001), "capture missed the line limit");
 const Quad quad{0, 0, 1, 1, 0, 0, 1, 1, 0};
 Require(payloadLimit.Composite(Key(1), std::vector<Quad>(MaxQuads, quad)), "capture refused quads at the limit");
 Require(!payloadLimit.Composite(Key(1), {quad}), "capture missed the quad limit");
 const auto payload = Parse(Serialized(payloadLimit, true));
 Require(payload.calls.size() == 2 && payload.calls[0].text.size() == MaxLine &&
         payload.calls[1].quads.size() == MaxQuads, "replay lost the longest permitted payloads");

 ReplayFixture test;
 test.Preset(24, 640, 480, true);
 test.Composite(Key(1), {{0, 0, 640, 480, 0, 0, 1, 1, 0}});
 test.Mode(true);
 test.Line(L"\u3010\u771f\u540d\u3011\u672c \u6587", 10000);
 Require(test.tape.calls.back().text == L"\u3010\ue000\ue001\u3011\ue002 \ue003", "line was not anonymized");
 test.Line(L"\u672c\t\u6587", 10001);
 Require(test.tape.calls.back().text == L"\ue002 \ue003", "repeated characters or blanks changed");
 // The native key for atlas 3 sorts before atlas 2, even though the IDs sort the other way.
 test.Draw(Key(2), 1024, 2048, Key(1), 640, 480, 640, 480, Row(2, 50, 150, 24, 0.1f), 10002);
 test.Draw(Key(3), 1024, 2048, Key(1), 640, 480, 640, 480, Row(2, 50, 350, 24, 0.2f), 10002);
 test.Frame(10003, 640, 480);
 Require(test.output.rows.str().find("rects=50,350,24,24") != std::string::npos, "fixture did not exercise group precedence");
 const auto row = Row(2, 50, 350, 24, 0.2f);
 Require(test.Draw(Key(3), 1024, 2048, Key(1), 640, 480, 640, 480, row, 10004).empty(), "read-only dropped glyphs");
 test.Mode(false);
 Require(test.Draw(Key(3), 1024, 2048, Key(1), 640, 480, 640, 480, row, 10005).size() == 2, "hide mode kept glyphs");
 test.Off();
 test.Frame(10006, 640, 480);
 Compare(test.output.rows.str(), Run(Parse(Serialized(test.tape))), "mode, preset, or group order changed");

 Tape limit;
 for (unsigned i = 0; i < MaxEvents; ++i) Require(limit.Off(), "capture stopped too early");
 Require(!limit.Off(), "capture missed the event limit");
 const auto prefix = Parse(Serialized(limit, true));
 Require(prefix.limited && prefix.calls.size() == MaxEvents, "bounded capture did not keep a replayable prefix");
}

template <class Play>
void CheckFixture(const std::filesystem::path &dir, const wchar_t *name, const Tape &recording,
                  const std::string &expected, bool generate, Play play) {
 try {
  const std::string tape = Serialized(recording);
  const auto inputFile = dir / (std::wstring(name) + L".replay");
  const auto outputFile = dir / (std::wstring(name) + L".expected");
  if (generate) {
   WriteFile(inputFile, tape);
   WriteFile(outputFile, expected);
  }
  const std::string saved = Bytes(inputFile);
  Compare(tape, saved, "fixture input changed");
  const std::string first = play(Parse(saved));
  Compare(expected, first, "replay differs from the direct run");
  Compare(Bytes(outputFile), first, "replay differs from the baseline");
  Compare(first, play(Parse(saved)), "replay was not deterministic");
  std::printf("PASS replay %ls\n", name);
 } catch (const std::exception &) {
  std::fprintf(stderr, "Fixture %ls failed\n", name);
  throw;
 }
}

void Fixtures(const std::filesystem::path &dir, bool generate, const std::wstring &only) {
 if (generate) std::filesystem::create_directories(dir);
 const auto checkGpu = [&](const FixtureCase &fixture) {
  ReplayFixture direct;
  fixture.run(direct);
  CheckFixture(dir, fixture.name, direct.tape, direct.output.rows.str(), generate, Run);
 };
 bool matched = false;
 for (const auto &fixture : ReplayFixtures) {
  if (!only.empty() && only != fixture.name) continue;
  checkGpu(fixture);
  matched = true;
 }
 for (const auto &fixture : CmvsUsertest::Cases) {
  if (!only.empty() && only != fixture.name) continue;
  checkGpu(fixture);
  matched = true;
 }
 for (const auto &fixture : EngineGpuFixtures) {
  if (!only.empty() && only != fixture.name) continue;
  checkGpu(fixture);
  matched = true;
 }
 for (const auto &fixture : EngineLayerFixtures) {
  if (!only.empty() && only != fixture.name) continue;
  Tape direct;
  fixture.record(direct);
  CheckFixture(dir, fixture.name, direct, fixture.replay(direct.calls), generate,
               [&](const ReplayInput &input) { return fixture.replay(input.calls); });
  matched = true;
 }
 Require(matched, "unknown fixture name");
 if (!only.empty()) return;
 CheckGroupKeys();
 CheckFormat();
 CmvsUsertest::CheckColdAtlasGuards();
 CmvsUsertest::CheckLateColdTail();
 CmvsUsertest::CheckUnconfirmedColdProbe();
 CmvsUsertest::CheckMovedColdRow();
 CmvsUsertest::CheckVisibleColdCrop();
 CmvsUsertest::CheckColdUnicode();
 const std::string trailingBytes = "MEGULIT_GPU_REPLAY 1\nEND complete\n\x1aO\n";
 const auto badPath = dir / L"trailing-data.replay";
 if (generate) WriteFile(badPath, trailingBytes);
 Require(Bytes(badPath) == trailingBytes, "file reader ignored trailing bytes");
 ReplayInput rejected;
 Require(!ReadTapeFile(badPath, rejected), "trailing data accepted from file");
 puts("PASS replay input validation, anonymity, group order and capture limit");
}

} // namespace

int wmain(int argc, wchar_t **argv) {
 try {
  if ((argc == 3 || argc == 4) && (std::wstring(argv[1]) == L"--check" || std::wstring(argv[1]) == L"--generate")) {
   Fixtures(argv[2], std::wstring(argv[1]) == L"--generate", argc == 4 ? argv[3] : L"");
   return 0;
  }
  if (argc == 2 || argc == 3) {
   ReplayInput tape;
   Require(ReadTapeFile(argv[1], tape), "invalid or incomplete GPU replay");
   const std::string output = Run(tape);
   if (tape.limited) std::cerr << "GPU replay contains a bounded prefix\n";
   if (argc == 3) Compare(Bytes(argv[2]), output, "replay differs from the baseline");
   std::cout << output;
   return 0;
  }
  std::cerr << "usage: replay <input.replay> [expected] | --check <fixtures> [name] | --generate <fixtures> [name]\n";
 } catch (const std::exception &error) {
  std::cerr << error.what() << '\n';
 }
 return 1;
}
