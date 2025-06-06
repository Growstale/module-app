import os

base_path = r'D:\6sem_BSTU\module-app'
output_file = os.path.join(base_path, 'all_code.txt')


def write_files_from_subdir(subdir_name, file_handle):
    subdir_path = os.path.join(base_path, subdir_name)
    file_handle.write(f"\n========== FILES FROM: {subdir_name} ==========\n\n")

    # Специальная обработка поддиректории "server"
    if subdir_name == 'server':
        server_js_path = os.path.join(subdir_path, 'server.js')
        if os.path.exists(server_js_path):
            try:
                with open(server_js_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                content = "[BINARY OR NON-TEXT FILE SKIPPED]"

            relative_path = os.path.relpath(server_js_path, base_path)
            file_handle.write(f"{relative_path}:\n")
            file_handle.write(content + "\n\n")
        else:
            file_handle.write("[server.js not found]\n\n")
        return  # не продолжаем обход

    # Для всех остальных директорий — обычный обход
    for root, dirs, files in os.walk(subdir_path):
        for filename in files:
            file_path = os.path.join(root, filename)
            relative_path = os.path.relpath(file_path, base_path)

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                content = "[BINARY OR NON-TEXT FILE SKIPPED]"

            file_handle.write(f"{relative_path}:\n")
            file_handle.write(content + "\n\n")


with open(output_file, 'w', encoding='utf-8') as result:
    write_files_from_subdir('server', result)
    write_files_from_subdir(r'client\src', result)

print(f"Файл all_code.txt успешно создан в {output_file}")
