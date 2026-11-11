-- Read-only checks. Do not automatically delete, merge or normalize these records.
SELECT DB_NAME() AS SelectedDatabase;
SELECT PassportNumber, COUNT(*) AS DuplicateCount FROM dbo.Horse
WHERE PassportNumber IS NOT NULL GROUP BY PassportNumber HAVING COUNT(*) > 1;
SELECT HorseID, HorseName, PassportNumber FROM dbo.Horse
WHERE PassportNumber IN (SELECT PassportNumber FROM dbo.Horse WHERE PassportNumber IS NOT NULL GROUP BY PassportNumber HAVING COUNT(*) > 1);
SELECT Phone, COUNT(*) AS DuplicateCount FROM dbo.[User]
WHERE Phone IS NOT NULL GROUP BY Phone HAVING COUNT(*) > 1;
SELECT UserID, FullName, Phone FROM dbo.[User]
WHERE Phone IN (SELECT Phone FROM dbo.[User] WHERE Phone IS NOT NULL GROUP BY Phone HAVING COUNT(*) > 1);
-- Legacy formats remain stored; edits/submissions must pass the integrated validation.
SELECT HorseID, HorseName, PassportNumber FROM dbo.Horse
WHERE PassportNumber IS NOT NULL AND (LEN(PassportNumber) <> 15 OR PassportNumber LIKE '%[^A-Za-z0-9]%');
SELECT UserID, FullName, Phone FROM dbo.[User]
WHERE Phone IS NOT NULL AND (LEN(Phone) <> 10 OR Phone LIKE '%[^0-9]%');
SELECT HorseID, COUNT(*) AS OpenReports FROM dbo.HealthReport
WHERE Status IN ('Reported', 'Reviewing') GROUP BY HorseID HAVING COUNT(*) > 1;
