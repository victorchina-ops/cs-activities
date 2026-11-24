using System;

class Program
{
    static void Main()
    {
        int age = int.Parse(Console.ReadLine());
        int height = int.Parse(Console.ReadLine());
        int withParent = int.Parse(Console.ReadLine());
        bool bigKid = age >= 12 && height >= 140;
        bool smallKid = age >= 8 && height >= 120 && withParent == 1;
        if (bigKid || smallKid)
        {
            Console.WriteLine("מותר לטפס");
        }
        else
        {
            Console.WriteLine("אסור לטפס");
        }
    }
}