#ifndef OSCAR_ENGINE_H
#define OSCAR_ENGINE_H
#ifdef __cplusplus
extern "C" {
#endif
typedef void (*OscarInfoCallback)(const char *line, void *context);
void *oscar_engine_create(const char *network_path);
void oscar_engine_destroy(void *handle);
void oscar_engine_stop(void *handle);
// Calls are serialized by the caller. stop may run concurrently with search.
// Returned strings are owned by the caller and released with oscar_engine_free.
char *oscar_engine_search(void *handle, const char *fen, const char *moves,
                          int milliseconds, int depth, int skill, int infinite,
                          OscarInfoCallback callback, void *context);
void oscar_engine_free(char *value);
#ifdef __cplusplus
}
#endif
#endif
