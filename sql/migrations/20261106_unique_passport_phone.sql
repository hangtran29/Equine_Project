-- Số hộ chiếu (UELN) và số điện thoại không được trùng. Chạy được nhiều lần.
-- Nếu database cũ đang có dữ liệu trùng, lệnh tạo chỉ mục sẽ báo lỗi: hãy sửa các dòng trùng trước.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Horse_PassportNumber' AND object_id = OBJECT_ID('dbo.Horse'))
    CREATE UNIQUE INDEX UX_Horse_PassportNumber ON dbo.Horse(PassportNumber) WHERE PassportNumber IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_User_Phone' AND object_id = OBJECT_ID('dbo.[User]'))
    CREATE UNIQUE INDEX UX_User_Phone ON dbo.[User](Phone) WHERE Phone IS NOT NULL;
