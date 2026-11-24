using System;
class Program
{
    static void Main()
    {
        int students = int.Parse(Console.ReadLine());
        int groupSize = int.Parse(Console.ReadLine());
        int groups = students / groupSize;
        int left = students % groupSize;
        Console.WriteLine("קבוצות מלאות: " + groups);
        Console.WriteLine("נשארים: " + left);
    }
}