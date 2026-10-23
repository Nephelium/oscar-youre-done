#include "OscarEngine.h"
#include "attacks.h"
#include "engine.h"
#include "position.h"
#include "tune.h"
#include "uci.h"
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <memory>
#include <mutex>
#include <sstream>

namespace {
struct Handle { std::unique_ptr<Stockfish::Engine> engine; };
struct CallbackGuard {
    Stockfish::Engine &engine;
    ~CallbackGuard() {
        engine.stop();
        engine.wait_for_search_finished();
        engine.set_on_start([] {});
        engine.set_on_update_full([](const auto &) {});
        engine.set_on_update_no_moves([](const auto &) {});
        engine.set_on_bestmove([](std::string_view, std::string_view) {});
    }
};
std::once_flag initialized;
char *copy(const std::string &value) {
    auto *result = static_cast<char *>(std::malloc(value.size() + 1));
    if (result) std::memcpy(result, value.c_str(), value.size() + 1);
    return result;
}
void option(Stockfish::Engine &engine, const std::string &name, const std::string &value) {
    std::istringstream input("name " + name + " value " + value);
    engine.get_options().setoption(input);
}
}

extern "C" void *oscar_engine_create(const char *network_path) {
    try {
        if (!network_path || !std::filesystem::is_regular_file(network_path)) return nullptr;
        std::call_once(initialized, [] { Stockfish::Attacks::init(); Stockfish::Position::init(); });
        auto handle = std::make_unique<Handle>();
        // Engine resolves its default NNUE beside this synthetic executable path.
        auto executable = std::filesystem::path(network_path).parent_path() / "oscar-engine";
        handle->engine = std::make_unique<Stockfish::Engine>(executable);
        auto &engine = *handle->engine;
        engine.get_options().add_info_listener([](const auto &) {});
        engine.set_on_verify_network([](std::string_view) {});
        engine.set_on_start([] {});
        engine.set_on_iter([](const auto &) {});
        option(engine, "EvalFile", network_path);
        option(engine, "Threads", "1");
        option(engine, "Hash", "32");
        option(engine, "UCI_ShowWDL", "true");
        Stockfish::Tune::init(engine.get_options());
        return handle.release();
    } catch (...) { return nullptr; }
}

extern "C" void oscar_engine_stop(void *handle) {
    if (handle) static_cast<Handle *>(handle)->engine->stop();
}
extern "C" void oscar_engine_destroy(void *handle) {
    if (!handle) return;
    oscar_engine_stop(handle);
    delete static_cast<Handle *>(handle);
}
extern "C" void oscar_engine_free(char *value) { std::free(value); }

extern "C" char *oscar_engine_search(void *raw, const char *fen, const char *moves,
                                      int milliseconds, int depth, int skill, int infinite,
                                      OscarInfoCallback callback, void *context) {
    if (!raw || !fen) return copy("{\"error\":\"引擎尚未就绪\"}");
    try {
        auto &engine = *static_cast<Handle *>(raw)->engine;
        engine.wait_for_search_finished();
        std::vector<std::string> history;
        std::istringstream input(moves ? moves : "");
        for (std::string move; input >> move;) history.push_back(move);
        if (engine.set_position(fen, history)) return copy("{\"error\":\"局面或走法无效\"}");
        option(engine, "Skill Level", std::to_string(std::clamp(skill, 0, 20)));
        option(engine, "MultiPV", skill < 20 ? "1" : "3");
        std::string best;
        CallbackGuard cleanup{engine};
        // onStart runs after go() resets Stockfish's stop flag. Swift rechecks
        // cancellation here, including a cancel just before go() was called.
        engine.set_on_start([=] { if (callback) callback("started", context); });
        engine.set_on_update_no_moves([=](const auto &info) {
            std::ostringstream line;
            line << "info depth " << info.depth << " score " << Stockfish::UCIEngine::format_score(info.score);
            if (callback) callback(line.str().c_str(), context);
        });
        engine.set_on_update_full([=](const auto &info) {
            if (!info.bound.empty()) return;
            std::ostringstream line;
            line << "info depth " << info.depth << " multipv " << info.multiPV
                 << " score " << Stockfish::UCIEngine::format_score(info.score)
                 << " wdl " << info.wdl << " time " << info.timeMs << " pv " << info.pv;
            if (callback) callback(line.str().c_str(), context);
        });
        engine.set_on_bestmove([&best](std::string_view move, std::string_view) { best = move; });
        Stockfish::Search::LimitsType limits;
        limits.startTime = Stockfish::now();
        if (infinite) limits.infinite = 1;
        else {
            limits.movetime = std::clamp(milliseconds, 100, 10000);
            limits.depth = std::clamp(depth, 1, 40);
        }
        engine.go(limits);
        engine.wait_for_search_finished();
        return copy("{\"move\":\"" + best + "\"}");
    } catch (...) { return copy("{\"error\":\"引擎计算失败\"}"); }
}
